#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*ble_prov_complete_cb_t)(void);

void ble_prov_start(const char *device_id, ble_prov_complete_cb_t on_complete);
void ble_prov_set_status(const char *status_str);
bool ble_prov_is_active(void);

#ifdef __cplusplus
}
#endif
