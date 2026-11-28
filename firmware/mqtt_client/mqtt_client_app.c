#include "mqtt_client_app.h"
#include "calibration.h"
#include "cJSON.h"
#include "energy_counter.h"
#include "esp_log.h"
#include "esp_system.h"
#include "fota_manager.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_indicator.h"
#include "mqtt_client.h"
#include "offline_buffer.h"
#include "persistent_storage.h"
#include "relay_controller.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const char *TAG = "SEM_MQTT";
static esp_mqtt_client_handle_t s_client = NULL;
static bool s_connected = false;
static sem_mqtt_state_cb_t s_on_state = NULL;
static char s_dev_id[64] = "SEM_ESP32S3_01";
static char s_fw_ver[32] = "1.3.1";
static int s_interval_sec = 10;

void sem_mqtt_format_ist_iso8601(char *buf, size_t len) {
    time_t now = time(NULL) + (5 * 3600 + 1800); // Shift UTC to Asia/Kolkata (+05:30)
    struct tm tm_info;
    gmtime_r(&now, &tm_info);
    strftime(buf, len, "%Y-%m-%dT%H:%M:%S+05:30", &tm_info);
}

static void on_fota_progress(const char *status, int progress_pct, const char *version, const char *error_msg) {
    (void)error_msg;
    sem_mqtt_publish_status("online", status, progress_pct, version);
    if (strcmp(status, "failed") == 0) {
        led_ind_set_visual_state(s_connected ? LED_DEV_STATE_ONLINE : LED_DEV_STATE_OFFLINE_BUFFER);
    }
}

void sem_mqtt_publish_status(const char *status_str, const char *ota_status, int ota_progress_pct, const char *ota_version) {
    if (!s_client || !s_connected) return;
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id", s_dev_id);
    cJSON_AddStringToObject(root, "status", status_str ? status_str : "online");
    cJSON_AddStringToObject(root, "version", ota_version ? ota_version : s_fw_ver);
    cJSON_AddNumberToObject(root, "offline_buffered_count", (double)offline_buffer_get_count());
    if (ota_status) {
        cJSON_AddStringToObject(root, "ota_status", ota_status);
        cJSON_AddNumberToObject(root, "ota_progress", ota_progress_pct);
    }
    relay_ctrl_append_status_json(root);

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!json_str) return;

    char topic[96];
    snprintf(topic, sizeof(topic), "energy/%s/status", s_dev_id);
    esp_mqtt_client_publish(s_client, topic, json_str, 0, 1, 1);
    free(json_str);
}

static void handle_incoming_message(const char *topic, int topic_len, const char *data, int data_len) {
    if (topic_len <= 0 || data_len <= 0 || data_len > 8192) return;
    char tbuf[128] = {0};
    snprintf(tbuf, sizeof(tbuf), "%.*s", topic_len, topic);

    char *dbuf = (char *)malloc((size_t)data_len + 1);
    if (!dbuf) return;
    memcpy(dbuf, data, (size_t)data_len);
    dbuf[data_len] = '\0';

    cJSON *root = cJSON_Parse(dbuf);
    free(dbuf);
    if (!root) return;

    if (strstr(tbuf, "/config")) {
        const cJSON *iv = cJSON_GetObjectItem(root, "telemetry_interval_sec");
        if (cJSON_IsNumber(iv) && iv->valueint >= 1 && iv->valueint <= 3600) {
            s_interval_sec = iv->valueint;
        }
        const cJSON *cal = cJSON_GetObjectItem(root, "calibration");
        if (cJSON_IsObject(cal)) {
            calibration_params_t p;
            calibration_load(&p);
            const cJSON *vc = cJSON_GetObjectItem(cal, "voltageCalibrationFactor");
            const cJSON *ic = cJSON_GetObjectItem(cal, "currentCalibrationFactor");
            const cJSON *ph = cJSON_GetObjectItem(cal, "phaseCorrectionDeg");
            if (cJSON_IsNumber(vc)) p.voltage_cal_factor = (float)vc->valuedouble;
            if (cJSON_IsNumber(ic)) p.current_cal_factor = (float)ic->valuedouble;
            if (cJSON_IsNumber(ph)) p.phase_correction_deg = (float)ph->valuedouble;
            calibration_save(&p);
        }
        const cJSON *led_cfg = cJSON_GetObjectItem(root, "led_config");
        if (!led_cfg) led_cfg = cJSON_GetObjectItem(root, "io_config");
        if (cJSON_IsObject(led_cfg)) {
            led_ind_apply_config_json(led_cfg);
        }
        const cJSON *off_en = cJSON_GetObjectItem(root, "offline_buffer_enabled");
        if (!off_en && cJSON_IsObject(led_cfg)) off_en = cJSON_GetObjectItem(led_cfg, "offline_buffer_enabled");
        if (cJSON_IsBool(off_en)) offline_buffer_set_enabled(cJSON_IsTrue(off_en));

        const cJSON *relays = cJSON_GetObjectItem(root, "relays");
        const cJSON *scheds = cJSON_GetObjectItem(root, "schedules");
        if (cJSON_IsArray(relays)) {
            relay_ctrl_apply_sync_json(relays, scheds);
            sem_mqtt_publish_status("online", NULL, 0, s_fw_ver);
        }
    } else if (strstr(tbuf, "/command")) {
        const cJSON *cmd = cJSON_GetObjectItem(root, "command");
        if (cJSON_IsString(cmd)) {
            if (strcmp(cmd->valuestring, "flush_energy") == 0) {
                energy_counter_flush_now();
            } else if (strcmp(cmd->valuestring, "set_relay") == 0) {
                const cJSON *ch = cJSON_GetObjectItem(root, "ch");
                if (!ch) ch = cJSON_GetObjectItem(root, "channel_index");
                const cJSON *st = cJSON_GetObjectItem(root, "state");
                if (cJSON_IsNumber(ch) && cJSON_IsBool(st)) {
                    relay_ctrl_set_state((uint8_t)ch->valueint, cJSON_IsTrue(st), true);
                    sem_mqtt_publish_status("online", NULL, 0, s_fw_ver);
                }
            } else if (strcmp(cmd->valuestring, "ota_update") == 0) {
                const cJSON *url = cJSON_GetObjectItem(root, "url");
                if (!url) url = cJSON_GetObjectItem(root, "binary_url");
                const cJSON *ver = cJSON_GetObjectItem(root, "version");
                if (cJSON_IsString(url)) {
                    bool started = fota_manager_start(
                        url->valuestring,
                        cJSON_IsString(ver) ? ver->valuestring : "latest",
                        on_fota_progress
                    );
                    if (!started) {
                        sem_mqtt_publish_status("online", "failed", 0, s_fw_ver);
                    }
                }
            } else if (strcmp(cmd->valuestring, "factory_reset") == 0) {
                pstore_factory_reset();
                sem_mqtt_publish_status("factory_reset", NULL, 0, s_fw_ver);
                vTaskDelay(pdMS_TO_TICKS(300));
                esp_restart();
            }
        }
    }
    cJSON_Delete(root);
}

static void mqtt_event_handler(void *arg, esp_event_base_t base, int32_t event_id, void *event_data) {
    (void)arg; (void)base;
    esp_mqtt_event_handle_t ev = (esp_mqtt_event_handle_t)event_data;
    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED: {
            s_connected = true;
            led_ind_set_visual_state(LED_DEV_STATE_ONLINE);
            ESP_LOGI(TAG, "MQTT TLS connected for %s", s_dev_id);

            char cfg_topic[96], cmd_topic[96];
            snprintf(cfg_topic, sizeof(cfg_topic), "energy/%s/config", s_dev_id);
            snprintf(cmd_topic, sizeof(cmd_topic), "energy/%s/command", s_dev_id);

            esp_mqtt_client_subscribe(s_client, cfg_topic, 1);
            esp_mqtt_client_subscribe(s_client, cmd_topic, 1);
            sem_mqtt_publish_status("online", NULL, 0, s_fw_ver);
            if (s_on_state) s_on_state(true, false);
            break;
        }
        case MQTT_EVENT_DISCONNECTED:
            s_connected = false;
            led_ind_set_visual_state(LED_DEV_STATE_OFFLINE_BUFFER);
            ESP_LOGW(TAG, "MQTT disconnected; switching to local SPIFFS offline buffering");
            if (s_on_state) s_on_state(false, false);
            break;
        case MQTT_EVENT_ERROR:
            if (ev && ev->error_handle) {
                if (ev->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
                    ESP_LOGE(TAG, "EMQX refused MQTT connection (CONNACK return_code=%d); check EMQX Authentication user/password and ACL",
                             (int)ev->error_handle->connect_return_code);
                    if (s_on_state) s_on_state(false, true);
                } else {
                    ESP_LOGW(TAG, "MQTT transport error_type=%d tls_err=%d",
                             (int)ev->error_handle->error_type, (int)ev->error_handle->esp_tls_last_esp_err);
                }
            }
            break;
        case MQTT_EVENT_DATA:
            handle_incoming_message(ev->topic, ev->topic_len, ev->data, ev->data_len);
            break;
        default:
            break;
    }
}

void sem_mqtt_start(const sem_mqtt_config_t *cfg) {
    if (!cfg || !cfg->broker_uri || !cfg->device_id) return;
    if (s_client) {
        esp_mqtt_client_stop(s_client);
        esp_mqtt_client_destroy(s_client);
        s_client = NULL;
        s_connected = false;
    }
    s_on_state = cfg->on_state;
    snprintf(s_dev_id, sizeof(s_dev_id), "%s", cfg->device_id);
    if (cfg->firmware_version) snprintf(s_fw_ver, sizeof(s_fw_ver), "%s", cfg->firmware_version);

    static char lwt_topic[96];
    static char lwt_msg[160];
    snprintf(lwt_topic, sizeof(lwt_topic), "energy/%s/status", s_dev_id);
    snprintf(lwt_msg, sizeof(lwt_msg),
             "{\"device_id\":\"%s\",\"status\":\"offline\",\"reason\":\"LWT\"}", s_dev_id);

    esp_mqtt_client_config_t mcfg = {
        .broker.address.uri = cfg->broker_uri,
        .broker.verification.certificate = cfg->ca_cert_pem,
        .credentials.client_id = s_dev_id,
        .credentials.username = cfg->mqtt_user,
        .credentials.authentication.password = cfg->mqtt_pass,
        .session.keepalive = 20,
        .session.last_will = {
            .topic = lwt_topic,
            .msg = lwt_msg,
            .msg_len = (int)strlen(lwt_msg),
            .qos = 1,
            .retain = 1,
        },
        .network.reconnect_timeout_ms = 5000,
    };

    s_client = esp_mqtt_client_init(&mcfg);
    esp_mqtt_client_register_event(s_client, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_client);
}

bool sem_mqtt_is_connected(void) { return s_connected; }
int sem_mqtt_get_interval_sec(void) { return s_interval_sec; }

bool sem_mqtt_publish_telemetry(
    const char *device_id,
    float v_rms,
    float i_rms,
    float active_p,
    float apparent_p,
    float pf,
    float freq_hz,
    double energy_kwh,
    int wifi_rssi,
    uint32_t seq,
    const char *timestamp_iso_opt,
    bool buffered
) {
    if (!s_client || !s_connected) return false;
    char topic[96], ts[40], payload[480];
    if (timestamp_iso_opt && strlen(timestamp_iso_opt) >= 8) {
        snprintf(ts, sizeof(ts), "%s", timestamp_iso_opt);
    } else {
        sem_mqtt_format_ist_iso8601(ts, sizeof(ts));
    }
    snprintf(topic, sizeof(topic), "energy/%s/telemetry", device_id);
    snprintf(
        payload,
        sizeof(payload),
        "{\"device_id\":\"%s\",\"voltage_rms\":%.2f,\"current_rms\":%.3f,"
        "\"active_power\":%.2f,\"apparent_power\":%.2f,\"power_factor\":%.3f,"
        "\"frequency\":%.2f,\"energy_kwh\":%.4f,\"wifi_rssi\":%d,\"seq\":%lu,"
        "\"buffered\":%s,\"timestamp\":\"%s\"}",
        device_id, v_rms, i_rms, active_p, apparent_p, pf, freq_hz, energy_kwh,
        wifi_rssi, (unsigned long)seq, buffered ? "true" : "false", ts
    );
    int msg_id = esp_mqtt_client_publish(s_client, topic, payload, 0, 1, 0);
    return msg_id >= 0;
}

void sem_mqtt_publish_alert(const char *device_id, const char *alert_type, float observed, const char *msg) {
    if (!s_client || !s_connected) return;
    char topic[96], payload[256];
    snprintf(topic, sizeof(topic), "energy/%s/alerts", device_id);
    snprintf(
        payload,
        sizeof(payload),
        "{\"device_id\":\"%s\",\"alert_type\":\"%s\",\"observed\":%.2f,\"message\":\"%s\"}",
        device_id, alert_type, observed, msg ? msg : ""
    );
    esp_mqtt_client_publish(s_client, topic, payload, 0, 1, 0);
}
