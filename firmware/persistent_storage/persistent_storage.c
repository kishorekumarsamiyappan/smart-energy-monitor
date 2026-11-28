#include "persistent_storage.h"
#include "esp_crc.h"
#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include <string.h>

static const char *TAG = "PSTORE";
static const char *NVS_NS = "sem_store";

typedef struct {
    uint32_t seq;
    double kwh;
    uint32_t crc32;
} kwh_slot_t;

static uint32_t calc_slot_crc(const kwh_slot_t *s) {
    return esp_crc32_le(0, (const uint8_t *)s, offsetof(kwh_slot_t, crc32));
}

void pstore_init(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        err = nvs_flash_init();
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS init failed: %s", esp_err_to_name(err));
    }
}

bool pstore_load_lifetime_kwh(double *out_kwh) {
    if (!out_kwh) return false;
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return false;

    kwh_slot_t a = {0}, b = {0};
    size_t la = sizeof(a), lb = sizeof(b);
    bool valid_a = (nvs_get_blob(h, "kwh_a", &a, &la) == ESP_OK) && (la == sizeof(a)) && (a.crc32 == calc_slot_crc(&a));
    bool valid_b = (nvs_get_blob(h, "kwh_b", &b, &lb) == ESP_OK) && (lb == sizeof(b)) && (b.crc32 == calc_slot_crc(&b));
    nvs_close(h);

    if (valid_a && valid_b) {
        *out_kwh = (a.seq >= b.seq) ? a.kwh : b.kwh;
        return true;
    }
    if (valid_a) { *out_kwh = a.kwh; return true; }
    if (valid_b) { *out_kwh = b.kwh; return true; }
    return false;
}

bool pstore_save_lifetime_kwh(double kwh) {
    static uint32_t s_seq = 0;
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) return false;

    kwh_slot_t cur = {0};
    size_t l = sizeof(cur);
    if (s_seq == 0) {
        if (nvs_get_blob(h, "kwh_a", &cur, &l) == ESP_OK && cur.crc32 == calc_slot_crc(&cur)) s_seq = cur.seq;
        l = sizeof(cur);
        if (nvs_get_blob(h, "kwh_b", &cur, &l) == ESP_OK && cur.crc32 == calc_slot_crc(&cur) && cur.seq > s_seq) s_seq = cur.seq;
    }

    s_seq++;
    kwh_slot_t next = {.seq = s_seq, .kwh = kwh, .crc32 = 0};
    next.crc32 = calc_slot_crc(&next);

    const char *key = (s_seq % 2 == 0) ? "kwh_a" : "kwh_b";
    esp_err_t err = nvs_set_blob(h, key, &next, sizeof(next));
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

bool pstore_load_wifi_creds(char *ssid, size_t ssid_len, char *pass, size_t pass_len) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return false;
    bool ok = (nvs_get_str(h, "wifi_ssid", ssid, &ssid_len) == ESP_OK) &&
              (nvs_get_str(h, "wifi_pass", pass, &pass_len) == ESP_OK);
    nvs_close(h);
    return ok;
}

bool pstore_save_wifi_creds(const char *ssid, const char *pass) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) return false;
    nvs_set_str(h, "wifi_ssid", ssid ? ssid : "");
    nvs_set_str(h, "wifi_pass", pass ? pass : "");
    esp_err_t err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

bool pstore_load_mqtt_creds(char *device_id, size_t dev_len, char *user, size_t user_len, char *pass, size_t pass_len) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return false;
    bool ok = (nvs_get_str(h, "dev_id", device_id, &dev_len) == ESP_OK) &&
              (nvs_get_str(h, "mqtt_user", user, &user_len) == ESP_OK) &&
              (nvs_get_str(h, "mqtt_pass", pass, &pass_len) == ESP_OK);
    nvs_close(h);
    return ok;
}

bool pstore_save_mqtt_creds(const char *device_id, const char *user, const char *pass) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) return false;
    nvs_set_str(h, "dev_id", device_id ? device_id : "");
    nvs_set_str(h, "mqtt_user", user ? user : "");
    nvs_set_str(h, "mqtt_pass", pass ? pass : "");
    esp_err_t err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

bool pstore_load_calibration(float *v_cal, float *i_cal, float *phase_deg) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) return false;
    uint32_t raw = 0;
    if (v_cal && nvs_get_u32(h, "v_cal", &raw) == ESP_OK) memcpy(v_cal, &raw, sizeof(float));
    if (i_cal && nvs_get_u32(h, "i_cal", &raw) == ESP_OK) memcpy(i_cal, &raw, sizeof(float));
    if (phase_deg && nvs_get_u32(h, "ph_deg", &raw) == ESP_OK) memcpy(phase_deg, &raw, sizeof(float));
    nvs_close(h);
    return true;
}

bool pstore_save_calibration(float v_cal, float i_cal, float phase_deg) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) return false;
    uint32_t r1, r2, r3;
    memcpy(&r1, &v_cal, sizeof(float));
    memcpy(&r2, &i_cal, sizeof(float));
    memcpy(&r3, &phase_deg, sizeof(float));
    nvs_set_u32(h, "v_cal", r1);
    nvs_set_u32(h, "i_cal", r2);
    nvs_set_u32(h, "ph_deg", r3);
    esp_err_t err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

void pstore_factory_reset(void) {
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    if (nvs_open("sem_relays", NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    ESP_LOGW(TAG, "Factory reset completed: cleared Wi-Fi, MQTT, calibration, and relay NVS namespaces");
}
