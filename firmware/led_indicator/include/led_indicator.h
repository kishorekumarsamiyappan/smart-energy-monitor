#pragma once

#include "cJSON.h"
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    STATUS_LED_MODE_INBUILT_RGB = 0,
    STATUS_LED_MODE_SINGLE_GPIO = 1,
    STATUS_LED_MODE_DISABLED = 2,
} sem_status_led_mode_t;

typedef enum {
    LED_DEV_STATE_BLE_PROV = 0,
    LED_DEV_STATE_OFFLINE_BUFFER = 1,
    LED_DEV_STATE_ONLINE = 2,
    LED_DEV_STATE_FOTA = 3,
    LED_DEV_STATE_FAULT = 4,
} sem_device_visual_state_t;

typedef struct {
    sem_status_led_mode_t status_mode;
    int status_rgb_gpio;        // Default GPIO 48 on ESP32-S3 DevKit
    int status_single_gpio;     // Default GPIO 2
    bool pulse_enabled;
    int pulse_gpio;             // External consumption indication GPIO (default 21)
    int pulse_imp_per_kwh;      // Default 1600 imp/kWh
} sem_led_io_config_t;

void led_ind_init(void);
void led_ind_set_visual_state(sem_device_visual_state_t state);
void led_ind_on_power_sample(float active_power_w, double dt_sec);
void led_ind_apply_config_json(const cJSON *io_cfg);

#ifdef __cplusplus
}
#endif
