#pragma once

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void pstore_init(void);
bool pstore_load_lifetime_kwh(double *out_kwh);
bool pstore_save_lifetime_kwh(double kwh);

bool pstore_load_wifi_creds(char *ssid, size_t ssid_len, char *pass, size_t pass_len);
bool pstore_save_wifi_creds(const char *ssid, const char *pass);

bool pstore_load_mqtt_creds(char *device_id, size_t dev_len, char *user, size_t user_len, char *pass, size_t pass_len);
bool pstore_save_mqtt_creds(const char *device_id, const char *user, const char *pass);

bool pstore_load_calibration(float *v_cal, float *i_cal, float *phase_deg);
bool pstore_save_calibration(float v_cal, float i_cal, float phase_deg);

#ifdef __cplusplus
}
#endif
