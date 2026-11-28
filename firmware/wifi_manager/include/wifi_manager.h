#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char ssid[33];
    int8_t rssi;
    bool auth_required;
} wifi_scan_ap_t;

typedef void (*wifi_mgr_state_cb_t)(bool got_ip, bool conn_failed);

void wifi_mgr_init_and_connect(void);
void wifi_mgr_reconnect_with_nvs(void);
void wifi_mgr_set_state_cb(wifi_mgr_state_cb_t cb);
int wifi_mgr_scan_aps(wifi_scan_ap_t *out_aps, size_t max_aps);
bool wifi_mgr_is_connected(void);
int wifi_mgr_get_rssi(void);

#ifdef __cplusplus
}
#endif
