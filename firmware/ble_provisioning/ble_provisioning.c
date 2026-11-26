#include "ble_provisioning.h"
#include "cJSON.h"
#include "esp_log.h"
#include "host/ble_hs.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "persistent_storage.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include <string.h>

static const char *TAG = "BLE_PROV";
static char s_adv_name[40] = "SEM-DEVICE001";
static char s_status_buf[48] = "WAITING_CREDENTIALS";
static ble_prov_complete_cb_t s_on_complete = NULL;
static bool s_active = false;
static uint8_t s_own_addr_type = 0;

// Custom 128-bit UUIDs matching mobile/lib/services/ble_provisioning_service.dart
// Service: 73656d30-0001-4000-8000-00805f9b34fb
static const ble_uuid128_t UUID_SVC = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x40, 0x01, 0x00, 0x30, 0x6d, 0x65, 0x73);
static const ble_uuid128_t UUID_CHR_CREDS = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x40, 0x02, 0x00, 0x30, 0x6d, 0x65, 0x73);
static const ble_uuid128_t UUID_CHR_STATUS = BLE_UUID128_INIT(
    0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x40, 0x03, 0x00, 0x30, 0x6d, 0x65, 0x73);

static int gatt_creds_access_cb(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn_handle; (void)attr_handle; (void)arg;
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_UNLIKELY;

    char json_buf[256] = {0};
    uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
    if (len == 0 || len >= sizeof(json_buf)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    os_mbuf_copydata(ctxt->om, 0, len, json_buf);

    cJSON *root = cJSON_Parse(json_buf);
    if (!root) {
        ble_prov_set_status("INVALID_PAYLOAD");
        return BLE_ATT_ERR_UNLIKELY;
    }

    const cJSON *ssid = cJSON_GetObjectItem(root, "ssid");
    const cJSON *pass = cJSON_GetObjectItem(root, "pass");
    const cJSON *dev_id = cJSON_GetObjectItem(root, "device_id");
    const cJSON *mqtt_user = cJSON_GetObjectItem(root, "mqtt_user");
    const cJSON *mqtt_pass = cJSON_GetObjectItem(root, "mqtt_pass");

    if (cJSON_IsString(ssid) && strlen(ssid->valuestring) > 0) {
        // Security: NEVER log Wi-Fi password or MQTT secret!
        pstore_save_wifi_creds(ssid->valuestring, cJSON_IsString(pass) ? pass->valuestring : "");
        if (cJSON_IsString(dev_id) && cJSON_IsString(mqtt_user) && cJSON_IsString(mqtt_pass)) {
            pstore_save_mqtt_creds(dev_id->valuestring, mqtt_user->valuestring, mqtt_pass->valuestring);
        }
        ble_prov_set_status("CREDENTIALS_SAVED_CONNECTING");
        ESP_LOGI(TAG, "Received provisioning payload via BLE (credentials stored securely in NVS)");
        if (s_on_complete) s_on_complete();
    }

    memset(json_buf, 0, sizeof(json_buf)); // Scrub plaintext secrets from stack buffer
    cJSON_Delete(root);
    return 0;
}

static int gatt_status_access_cb(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    (void)conn_handle; (void)attr_handle; (void)arg;
    os_mbuf_append(ctxt->om, s_status_buf, strlen(s_status_buf));
    return 0;
}

static const struct ble_gatt_svc_def gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &UUID_SVC.u,
        .characteristics = (struct ble_gatt_chr_def[]){
            {
                .uuid = &UUID_CHR_CREDS.u,
                .access_cb = gatt_creds_access_cb,
                .flags = BLE_GATT_CHR_F_WRITE,
            },
            {
                .uuid = &UUID_CHR_STATUS.u,
                .access_cb = gatt_status_access_cb,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
            },
            {0},
        },
    },
    {0},
};

static void ble_advertise(void) {
    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.name = (uint8_t *)s_adv_name;
    fields.name_len = strlen(s_adv_name);
    fields.name_is_complete = 1;
    ble_gap_adv_set_fields(&fields);

    struct ble_gap_adv_params adv_params = {0};
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    ble_gap_adv_start(s_own_addr_type, NULL, BLE_HS_FOREVER, &adv_params, NULL, NULL);
}

static void on_ble_sync(void) {
    ble_hs_id_infer_auto(0, &s_own_addr_type);
    ble_advertise();
}

static void nimble_host_task(void *param) {
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void ble_prov_start(const char *device_id, ble_prov_complete_cb_t on_complete) {
    if (s_active) return;
    s_active = true;
    s_on_complete = on_complete;
    if (device_id && strlen(device_id) > 0) {
        snprintf(s_adv_name, sizeof(s_adv_name), "SEM-%s", device_id);
    }

    nimble_port_init();
    ble_hs_cfg.sync_cb = on_ble_sync;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    ble_gatts_count_cfg(gatt_svcs);
    ble_gatts_add_svcs(gatt_svcs);
    ble_svc_gap_device_name_set(s_adv_name);
    nimble_port_freertos_init(nimble_host_task);
    ESP_LOGI(TAG, "NimBLE provisioning started as %s", s_adv_name);
}

void ble_prov_set_status(const char *status_str) {
    if (!status_str) return;
    snprintf(s_status_buf, sizeof(s_status_buf), "%s", status_str);
}

bool ble_prov_is_active(void) { return s_active; }
