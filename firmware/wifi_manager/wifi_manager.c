#include "wifi_manager.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "persistent_storage.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *TAG = "WIFI_MGR";
static bool s_connected = false;
static bool s_sntp_started = false;
static bool s_has_creds = false;
static volatile bool s_scanning = false;
static int s_retry_count = 0;
static wifi_mgr_state_cb_t s_state_cb = NULL;

static void start_sntp_once(void) {
    if (s_sntp_started) return;
    s_sntp_started = true;
    esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    esp_sntp_init();
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data) {
    (void)arg; (void)data;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        if (s_has_creds && !s_scanning) {
            esp_wifi_connect();
        }
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        s_connected = false;
        if (s_scanning || !s_has_creds) {
            return;
        }
        s_retry_count++;
        ESP_LOGW(TAG, "Wi-Fi disconnected (attempt %d); retrying...", s_retry_count);
        if (s_retry_count >= 5 && s_state_cb) {
            s_state_cb(false, true);
        }
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        s_connected = true;
        s_retry_count = 0;
        ESP_LOGI(TAG, "Wi-Fi connected and IP assigned");
        start_sntp_once();
        if (s_state_cb) {
            s_state_cb(true, false);
        }
    }
}

void wifi_mgr_set_state_cb(wifi_mgr_state_cb_t cb) {
    s_state_cb = cb;
}

void wifi_mgr_init_and_connect(void) {
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL);
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_start();

    wifi_mgr_reconnect_with_nvs();
}

void wifi_mgr_reconnect_with_nvs(void) {
    char ssid[64] = {0};
    char pass[64] = {0};
    if (!pstore_load_wifi_creds(ssid, sizeof(ssid), pass, sizeof(pass)) || strlen(ssid) == 0) {
        s_has_creds = false;
        ESP_LOGW(TAG, "No Wi-Fi SSID provisioned yet; waiting for BLE provisioning.");
        return;
    }

    s_has_creds = true;
    s_retry_count = 0;
    wifi_config_t wifi_cfg = {0};
    strncpy((char *)wifi_cfg.sta.ssid, ssid, sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, pass, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = strlen(pass) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    esp_wifi_disconnect();
    esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg);
    esp_wifi_connect();
    memset(pass, 0, sizeof(pass)); // Scrub password from stack
}

int wifi_mgr_scan_aps(wifi_scan_ap_t *out_aps, size_t max_aps) {
    if (!out_aps || max_aps == 0 || s_scanning) return 0;

    s_scanning = true;
    // Pause pending STA connect attempt so esp_wifi_scan_start never hits ESP_ERR_WIFI_STATE
    if (!s_connected) {
        esp_wifi_disconnect();
    }

    wifi_scan_config_t scan_cfg = {
        .ssid = NULL,
        .bssid = NULL,
        .channel = 0,
        .show_hidden = false,
        .scan_type = WIFI_SCAN_TYPE_ACTIVE,
        .scan_time.active = {.min = 60, .max = 180},
    };

    esp_err_t err = esp_wifi_scan_start(&scan_cfg, true);
    uint16_t ap_num = 0;
    size_t count = 0;
    if (err == ESP_OK) {
        esp_wifi_scan_get_ap_num(&ap_num);
        uint16_t fetch_num = ap_num > 24 ? 24 : ap_num;
        wifi_ap_record_t *recs = fetch_num > 0 ? (wifi_ap_record_t *)calloc(fetch_num, sizeof(wifi_ap_record_t)) : NULL;
        if (recs && esp_wifi_scan_get_ap_records(&fetch_num, recs) == ESP_OK) {
            for (uint16_t i = 0; i < fetch_num; i++) {
                const char *ssid = (const char *)recs[i].ssid;
                if (!ssid || ssid[0] == '\0') continue;

                bool merged = false;
                for (size_t j = 0; j < count; j++) {
                    if (strcmp(out_aps[j].ssid, ssid) == 0) {
                        if (recs[i].rssi > out_aps[j].rssi) {
                            out_aps[j].rssi = recs[i].rssi;
                            out_aps[j].auth_required = (recs[i].authmode != WIFI_AUTH_OPEN);
                        }
                        merged = true;
                        break;
                    }
                }
                if (!merged && count < max_aps) {
                    snprintf(out_aps[count].ssid, sizeof(out_aps[count].ssid), "%s", ssid);
                    out_aps[count].rssi = recs[i].rssi;
                    out_aps[count].auth_required = (recs[i].authmode != WIFI_AUTH_OPEN);
                    count++;
                }
            }
            // Sort strongest RSSI first
            for (size_t i = 0; i < count; i++) {
                for (size_t j = i + 1; j < count; j++) {
                    if (out_aps[j].rssi > out_aps[i].rssi) {
                        wifi_scan_ap_t tmp = out_aps[i];
                        out_aps[i] = out_aps[j];
                        out_aps[j] = tmp;
                    }
                }
            }
        }
        free(recs);
    } else {
        ESP_LOGW(TAG, "Wi-Fi scan failed: %s", esp_err_to_name(err));
    }

    s_scanning = false;
    if (s_has_creds && !s_connected) {
        esp_wifi_connect();
    }
    return (int)count;
}

bool wifi_mgr_is_connected(void) { return s_connected; }

int wifi_mgr_get_rssi(void) {
    wifi_ap_record_t ap = {0};
    if (s_connected && esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        return ap.rssi;
    }
    return -100;
}
