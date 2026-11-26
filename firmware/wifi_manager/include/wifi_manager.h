#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void wifi_mgr_init_and_connect(void);
void wifi_mgr_reconnect_with_nvs(void);
bool wifi_mgr_is_connected(void);
int wifi_mgr_get_rssi(void);

#ifdef __cplusplus
}
#endif
