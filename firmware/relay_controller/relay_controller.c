#include "relay_controller.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nvs.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const char *TAG = "SEM_RELAY";
static const char *NVS_RELAY_NS = "sem_relays";

typedef struct {
    uint8_t count;
    relay_channel_t channels[SEM_MAX_RELAYS];
} relay_table_blob_t;

static relay_table_blob_t s_table = {0};
static SemaphoreHandle_t s_relay_mtx = NULL;

bool relay_ctrl_is_reserved_gpio(int gpio_pin) {
    if (gpio_pin < 1 || gpio_pin > 48) return true;
    // Reserve GPIO 4 (ZMPT101B ADC), GPIO 5 (SCT-013 ADC), USB (19,20), Flash/PSRAM (26..32), RGB LED (48)
    static const int RESERVED[] = {4, 5, 19, 20, 26, 27, 28, 29, 30, 31, 32, 48};
    for (size_t i = 0; i < sizeof(RESERVED) / sizeof(RESERVED[0]); i++) {
        if (gpio_pin == RESERVED[i]) return true;
    }
    return false;
}

static void drive_gpio(const relay_channel_t *ch) {
    if (!ch || relay_ctrl_is_reserved_gpio(ch->gpio_pin)) return;
    int level = (ch->current_state == ch->active_high) ? 1 : 0;
    gpio_set_level((gpio_num_t)ch->gpio_pin, level);
}

static void configure_all_gpios(void) {
    for (uint8_t i = 0; i < s_table.count; i++) {
        relay_channel_t *ch = &s_table.channels[i];
        if (relay_ctrl_is_reserved_gpio(ch->gpio_pin)) continue;
        gpio_config_t io = {
            .pin_bit_mask = (1ULL << ch->gpio_pin),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        gpio_config(&io);
        drive_gpio(ch);
    }
}

static void save_table_nvs(void) {
    nvs_handle_t h;
    if (nvs_open(NVS_RELAY_NS, NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_blob(h, "table", &s_table, sizeof(s_table));
    nvs_commit(h);
    nvs_close(h);
}

void relay_ctrl_init(void) {
    if (!s_relay_mtx) s_relay_mtx = xSemaphoreCreateMutex();
    xSemaphoreTake(s_relay_mtx, portMAX_DELAY);

    bool loaded = false;
    nvs_handle_t h;
    if (nvs_open(NVS_RELAY_NS, NVS_READONLY, &h) == ESP_OK) {
        size_t sz = sizeof(s_table);
        if (nvs_get_blob(h, "table", &s_table, &sz) == ESP_OK && sz == sizeof(s_table) && s_table.count <= SEM_MAX_RELAYS) {
            loaded = true;
        }
        nvs_close(h);
    }

    if (!loaded) {
        memset(&s_table, 0, sizeof(s_table));
        s_table.count = 0;
        save_table_nvs();
    } else {
        // Drop any stale channels mapped to reserved sensor/system pins (e.g. GPIO 4/5) & restore fail-safe state
        uint8_t kept = 0;
        for (uint8_t i = 0; i < s_table.count; i++) {
            if (relay_ctrl_is_reserved_gpio(s_table.channels[i].gpio_pin)) continue;
            s_table.channels[kept] = s_table.channels[i];
            s_table.channels[kept].current_state = s_table.channels[kept].fail_safe_state;
            s_table.channels[kept].manual_override = false;
            kept++;
        }
        if (kept != s_table.count) {
            s_table.count = kept;
            save_table_nvs();
        }
    }

    configure_all_gpios();
    ESP_LOGI(TAG, "Relay controller ready (%u optional relay channel(s) in NVS)", s_table.count);
    xSemaphoreGive(s_relay_mtx);
}

bool relay_ctrl_set_state(uint8_t channel_index, bool state_on, bool is_manual) {
    if (!s_relay_mtx) return false;
    xSemaphoreTake(s_relay_mtx, portMAX_DELAY);
    bool updated = false;
    for (uint8_t i = 0; i < s_table.count; i++) {
        if (s_table.channels[i].channel_index == channel_index) {
            s_table.channels[i].current_state = state_on;
            s_table.channels[i].manual_override = is_manual;
            drive_gpio(&s_table.channels[i]);
            updated = true;
            break;
        }
    }
    xSemaphoreGive(s_relay_mtx);
    return updated;
}

static uint16_t parse_hhmm(const char *str) {
    if (!str || strlen(str) < 5) return 0;
    int hh = atoi(str);
    int mm = atoi(str + 3);
    return (uint16_t)((hh * 60) + mm);
}

static bool is_minute_in_window(uint16_t now_min, uint16_t start_min, uint16_t stop_min) {
    if (start_min == stop_min) return false;
    if (start_min < stop_min) {
        return (now_min >= start_min) && (now_min < stop_min);
    }
    // Overnight window spanning midnight IST
    return (now_min >= start_min) || (now_min < stop_min);
}

void relay_ctrl_tick_offline_schedules(void) {
    time_t utc = time(NULL);
    if (utc < 1700000000LL || !s_relay_mtx) return; // Wait until RTC has valid wall-clock time

    time_t ist = utc + (5 * 3600 + 1800);
    struct tm tm_ist;
    gmtime_r(&ist, &tm_ist);
    uint16_t now_min = (uint16_t)(tm_ist.tm_hour * 60 + tm_ist.tm_min);
    uint8_t dow_bit = (uint8_t)(1U << (tm_ist.tm_wday % 7));

    static int s_last_eval_min = -1;
    if ((int)now_min == s_last_eval_min) return; // Evaluate schedule boundaries once per minute
    s_last_eval_min = (int)now_min;

    xSemaphoreTake(s_relay_mtx, portMAX_DELAY);
    for (uint8_t i = 0; i < s_table.count; i++) {
        relay_channel_t *ch = &s_table.channels[i];
        if (ch->schedule_count == 0) continue;

        bool any_active = false;
        bool boundary_start = false;
        bool boundary_stop = false;

        for (uint8_t s = 0; s < ch->schedule_count; s++) {
            const relay_schedule_t *sc = &ch->schedules[s];
            if (!sc->enabled || (sc->days_mask & dow_bit) == 0) continue;
            if (is_minute_in_window(now_min, sc->start_min_ist, sc->stop_min_ist)) {
                any_active = true;
            }
            if (now_min == sc->start_min_ist) boundary_start = true;
            if (now_min == sc->stop_min_ist) boundary_stop = true;
        }

        if (boundary_start || boundary_stop) {
            ch->manual_override = false; // Reset manual override on schedule edge even offline
        }
        if (!ch->manual_override && ch->current_state != any_active) {
            ch->current_state = any_active;
            drive_gpio(ch);
            ESP_LOGI(TAG, "Offline RTC schedule switched CH%u -> %s at %02d:%02d IST",
                     ch->channel_index, any_active ? "ON" : "OFF", tm_ist.tm_hour, tm_ist.tm_min);
        }
    }
    xSemaphoreGive(s_relay_mtx);
}

static void add_schedule_from_json(relay_channel_t *ch, const cJSON *sc_item) {
    if (!ch || !sc_item || ch->schedule_count >= SEM_MAX_SCHEDULES) return;
    relay_schedule_t *sc = &ch->schedules[ch->schedule_count++];
    const cJSON *sid = cJSON_GetObjectItem(sc_item, "id");
    const cJSON *sstart = cJSON_GetObjectItem(sc_item, "start");
    if (!sstart) sstart = cJSON_GetObjectItem(sc_item, "start_time_ist");
    const cJSON *sstop = cJSON_GetObjectItem(sc_item, "stop");
    if (!sstop) sstop = cJSON_GetObjectItem(sc_item, "stop_time_ist");
    const cJSON *sdays = cJSON_GetObjectItem(sc_item, "days");
    if (!sdays) sdays = cJSON_GetObjectItem(sc_item, "days_of_week");
    const cJSON *sen = cJSON_GetObjectItem(sc_item, "enabled");

    snprintf(sc->id, sizeof(sc->id), "%s", cJSON_IsString(sid) ? sid->valuestring : "");
    sc->start_min_ist = parse_hhmm(cJSON_IsString(sstart) ? sstart->valuestring : "06:00");
    sc->stop_min_ist = parse_hhmm(cJSON_IsString(sstop) ? sstop->valuestring : "07:00");
    sc->enabled = cJSON_IsBool(sen) ? cJSON_IsTrue(sen) : true;
    sc->days_mask = 0;
    if (cJSON_IsArray(sdays)) {
        const cJSON *d = NULL;
        cJSON_ArrayForEach(d, sdays) {
            if (cJSON_IsNumber(d) && d->valueint >= 0 && d->valueint <= 6) {
                sc->days_mask |= (uint8_t)(1U << d->valueint);
            }
        }
    }
    if (sc->days_mask == 0) sc->days_mask = 0x7F;
}

void relay_ctrl_apply_sync_json(const cJSON *relays_array, const cJSON *schedules_array_opt) {
    if (!cJSON_IsArray(relays_array) || !s_relay_mtx) return;
    xSemaphoreTake(s_relay_mtx, portMAX_DELAY);

    relay_table_blob_t next = {0};
    const cJSON *item = NULL;
    cJSON_ArrayForEach(item, relays_array) {
        if (next.count >= SEM_MAX_RELAYS) break;
        const cJSON *gpio = cJSON_GetObjectItem(item, "gpio");
        if (!gpio) gpio = cJSON_GetObjectItem(item, "gpio_pin");
        int pin = cJSON_IsNumber(gpio) ? gpio->valueint : SEM_DEFAULT_RELAY1_GPIO;
        if (relay_ctrl_is_reserved_gpio(pin)) continue;

        relay_channel_t *ch = &next.channels[next.count++];
        const cJSON *id = cJSON_GetObjectItem(item, "id");
        const cJSON *idx = cJSON_GetObjectItem(item, "ch");
        if (!idx) idx = cJSON_GetObjectItem(item, "channel_index");
        const cJSON *name = cJSON_GetObjectItem(item, "name");
        const cJSON *ah = cJSON_GetObjectItem(item, "active_high");
        const cJSON *fs = cJSON_GetObjectItem(item, "fail_safe");
        if (!fs) fs = cJSON_GetObjectItem(item, "fail_safe_state");
        const cJSON *st = cJSON_GetObjectItem(item, "state");
        if (!st) st = cJSON_GetObjectItem(item, "current_state");

        snprintf(ch->id, sizeof(ch->id), "%s", cJSON_IsString(id) ? id->valuestring : "");
        ch->channel_index = (uint8_t)(cJSON_IsNumber(idx) ? idx->valueint : next.count);
        snprintf(ch->name, sizeof(ch->name), "%s", cJSON_IsString(name) ? name->valuestring : "Relay");
        ch->gpio_pin = pin;
        ch->active_high = cJSON_IsBool(ah) ? cJSON_IsTrue(ah) : true;
        ch->fail_safe_state = cJSON_IsBool(fs) ? cJSON_IsTrue(fs) : false;
        ch->current_state = cJSON_IsBool(st) ? cJSON_IsTrue(st) : ch->fail_safe_state;

        const cJSON *nested_scheds = cJSON_GetObjectItem(item, "schedules");
        if (cJSON_IsArray(nested_scheds)) {
            const cJSON *sc_item = NULL;
            cJSON_ArrayForEach(sc_item, nested_scheds) {
                add_schedule_from_json(ch, sc_item);
            }
        }
    }

    if (cJSON_IsArray(schedules_array_opt)) {
        const cJSON *sc_item = NULL;
        cJSON_ArrayForEach(sc_item, schedules_array_opt) {
            const cJSON *sc_ch = cJSON_GetObjectItem(sc_item, "ch");
            if (!cJSON_IsNumber(sc_ch)) continue;
            for (uint8_t i = 0; i < next.count; i++) {
                if (next.channels[i].channel_index == (uint8_t)sc_ch->valueint) {
                    add_schedule_from_json(&next.channels[i], sc_item);
                    break;
                }
            }
        }
    }

    for (uint8_t i = 0; i < s_table.count; i++) {
        int old_pin = s_table.channels[i].gpio_pin;
        bool still_used = false;
        for (uint8_t j = 0; j < next.count; j++) {
            if (next.channels[j].gpio_pin == old_pin) {
                still_used = true;
                break;
            }
        }
        if (!still_used && !relay_ctrl_is_reserved_gpio(old_pin)) {
            gpio_reset_pin((gpio_num_t)old_pin);
        }
    }

    s_table = next;
    configure_all_gpios();
    save_table_nvs();
    xSemaphoreGive(s_relay_mtx);
}

void relay_ctrl_append_status_json(cJSON *root_status) {
    if (!root_status || !s_relay_mtx) return;
    cJSON *arr = cJSON_CreateArray();
    xSemaphoreTake(s_relay_mtx, portMAX_DELAY);
    for (uint8_t i = 0; i < s_table.count; i++) {
        cJSON *obj = cJSON_CreateObject();
        cJSON_AddNumberToObject(obj, "ch", s_table.channels[i].channel_index);
        cJSON_AddBoolToObject(obj, "state", s_table.channels[i].current_state);
        cJSON_AddItemToArray(arr, obj);
    }
    xSemaphoreGive(s_relay_mtx);
    cJSON_AddItemToObject(root_status, "relays", arr);
}
