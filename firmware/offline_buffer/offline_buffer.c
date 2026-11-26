#include "offline_buffer.h"
#include "cJSON.h"
#include "esp_log.h"
#include "esp_spiffs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

static const char *TAG = "OFFLINE_BUF";
static const char *SPOOL_PATH = "/offline/spool.ndjson";
static const char *OFFSET_PATH = "/offline/offset.bin";
static const long MAX_SPOOL_BYTES = 524288L; // 512 KB cap inside 828 KB SPIFFS partition

static SemaphoreHandle_t s_mutex = NULL;
static bool s_mounted = false;
static bool s_enabled = true;
static uint32_t s_queued_count = 0;

static uint32_t load_read_offset(void) {
    uint32_t off = 0;
    FILE *f = fopen(OFFSET_PATH, "rb");
    if (f) {
        if (fread(&off, sizeof(off), 1, f) != 1) off = 0;
        fclose(f);
    }
    return off;
}

static void save_read_offset(uint32_t off) {
    FILE *f = fopen(OFFSET_PATH, "wb");
    if (f) {
        fwrite(&off, sizeof(off), 1, f);
        fclose(f);
    }
}

static uint32_t recount_pending_lines(uint32_t start_offset) {
    FILE *f = fopen(SPOOL_PATH, "r");
    if (!f) return 0;
    fseek(f, (long)start_offset, SEEK_SET);
    char line[384];
    uint32_t count = 0;
    while (fgets(line, sizeof(line), f) != NULL) {
        if (strlen(line) > 5) count++;
    }
    fclose(f);
    return count;
}

void offline_buffer_init(void) {
    if (!s_mutex) s_mutex = xSemaphoreCreateMutex();
    esp_vfs_spiffs_conf_t conf = {
        .base_path = "/offline",
        .partition_label = "offline_log",
        .max_files = 4,
        .format_if_mount_failed = true,
    };
    esp_err_t err = esp_vfs_spiffs_register(&conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SPIFFS mount failed: %s", esp_err_to_name(err));
        return;
    }
    s_mounted = true;
    uint32_t off = load_read_offset();
    s_queued_count = recount_pending_lines(off);
    ESP_LOGI(TAG, "Offline telemetry ring buffer initialized (%lu queued records)",
             (unsigned long)s_queued_count);
}

void offline_buffer_set_enabled(bool enabled) { s_enabled = enabled; }
bool offline_buffer_is_enabled(void) { return s_enabled; }
uint32_t offline_buffer_get_count(void) { return s_queued_count; }

bool offline_buffer_push(const offline_sample_t *s) {
    if (!s_mounted || !s_enabled || !s) return false;
    xSemaphoreTake(s_mutex, portMAX_DELAY);

    struct stat st = {0};
    if (stat(SPOOL_PATH, &st) == 0 && st.st_size >= MAX_SPOOL_BYTES) {
        // Rotate full spool cleanly to preserve flash longevity and avoid ENOSPC
        ESP_LOGW(TAG, "Spool cap reached (%ld B); resetting ring buffer", (long)st.st_size);
        remove(SPOOL_PATH);
        save_read_offset(0);
        s_queued_count = 0;
    }

    FILE *f = fopen(SPOOL_PATH, "a");
    if (!f) {
        xSemaphoreGive(s_mutex);
        return false;
    }
    fprintf(
        f,
        "{\"v\":%.2f,\"i\":%.3f,\"p\":%.2f,\"s\":%.2f,\"pf\":%.3f,"
        "\"f\":%.2f,\"kwh\":%.4f,\"rssi\":%d,\"seq\":%lu,\"ts\":\"%s\"}\n",
        s->voltage_rms, s->current_rms, s->active_power_w, s->apparent_power_va,
        s->power_factor, s->frequency_hz, s->energy_kwh, s->wifi_rssi,
        (unsigned long)s->seq, s->timestamp_iso
    );
    fclose(f);
    s_queued_count++;

    xSemaphoreGive(s_mutex);
    return true;
}

int offline_buffer_drain(offline_drain_cb_t publish_cb, int max_items) {
    if (!s_mounted || !publish_cb || max_items <= 0 || s_queued_count == 0) return 0;
    xSemaphoreTake(s_mutex, portMAX_DELAY);

    uint32_t offset = load_read_offset();
    FILE *f = fopen(SPOOL_PATH, "r");
    if (!f) {
        s_queued_count = 0;
        xSemaphoreGive(s_mutex);
        return 0;
    }

    fseek(f, (long)offset, SEEK_SET);
    char line[384];
    int drained = 0;

    while (drained < max_items && fgets(line, sizeof(line), f) != NULL) {
        long next_pos = ftell(f);
        cJSON *obj = cJSON_Parse(line);
        if (!obj) {
            offset = (uint32_t)next_pos;
            continue;
        }

        offline_sample_t sample = {0};
        sample.voltage_rms = (float)cJSON_GetObjectItem(obj, "v")->valuedouble;
        sample.current_rms = (float)cJSON_GetObjectItem(obj, "i")->valuedouble;
        sample.active_power_w = (float)cJSON_GetObjectItem(obj, "p")->valuedouble;
        sample.apparent_power_va = (float)cJSON_GetObjectItem(obj, "s")->valuedouble;
        sample.power_factor = (float)cJSON_GetObjectItem(obj, "pf")->valuedouble;
        sample.frequency_hz = (float)cJSON_GetObjectItem(obj, "f")->valuedouble;
        sample.energy_kwh = cJSON_GetObjectItem(obj, "kwh")->valuedouble;
        sample.wifi_rssi = cJSON_GetObjectItem(obj, "rssi")->valueint;
        sample.seq = (uint32_t)cJSON_GetObjectItem(obj, "seq")->valuedouble;
        const cJSON *ts = cJSON_GetObjectItem(obj, "ts");
        if (cJSON_IsString(ts)) {
            snprintf(sample.timestamp_iso, sizeof(sample.timestamp_iso), "%s", ts->valuestring);
        }
        cJSON_Delete(obj);

        if (!publish_cb(&sample)) {
            break; // Stop draining immediately if MQTT drops mid-backfill
        }
        offset = (uint32_t)next_pos;
        if (s_queued_count > 0) s_queued_count--;
        drained++;
    }

    bool at_eof = feof(f) != 0 || (fgetc(f) == EOF);
    fclose(f);

    if (at_eof && drained > 0) {
        remove(SPOOL_PATH);
        save_read_offset(0);
        s_queued_count = 0;
        ESP_LOGI(TAG, "Offline spool completely drained to cloud (%d records)", drained);
    } else if (drained > 0) {
        save_read_offset(offset);
    }

    xSemaphoreGive(s_mutex);
    return drained;
}
