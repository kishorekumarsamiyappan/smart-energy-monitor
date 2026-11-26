#include "wifi_manager.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "persistent_storage.h"
#include <string.h>

static const char *TAG = "WIFI_MGR";
static bool s_connected = false;
static bool s_sntp_started = false;

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
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        s_connected = false;
        ESP_LOGW(TAG, "Wi-Fi disconnected; retrying...");
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        s_connected = true;
        ESP_LOGI(TAG, "Wi-Fi connected and IP assigned");
        start_sntp_once();
    }
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
        ESP_LOGW(TAG, "No Wi-Fi SSID provisioned yet; waiting for BLE provisioning.");
        return;
    }

    wifi_config_t wifi_cfg = {0};
    strncpy((char *)wifi_cfg.sta.ssid, ssid, sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, pass, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = strlen(pass) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    esp_wifi_disconnect();
    esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg);
    esp_wifi_connect();
    memset(pass, 0, sizeof(pass)); // Scrub password from stack
}

bool wifi_mgr_is_connected(void) { return s_connected; }

int wifi_mgr_get_rssi(void) {
    wifi_ap_record_t ap = {0};
    if (s_connected && esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        return ap.rssi;
    }
    return -100;
}
