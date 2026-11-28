#pragma once

#include "cJSON.h"
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SEM_MAX_RELAYS 8
#define SEM_MAX_SCHEDULES 6
#define SEM_DEFAULT_RELAY1_GPIO 15

typedef struct {
    char id[40];
    uint16_t start_min_ist; // 0..1439
    uint16_t stop_min_ist;  // 0..1439
    uint8_t days_mask;      // bit 0 = Sun .. bit 6 = Sat
    bool enabled;
} relay_schedule_t;

typedef struct {
    char id[40];
    uint8_t channel_index;  // 1..8 (CH1 always present)
    char name[48];
    int gpio_pin;
    bool active_high;
    bool fail_safe_state;
    bool current_state;
    bool manual_override;
    uint8_t schedule_count;
    relay_schedule_t schedules[SEM_MAX_SCHEDULES];
} relay_channel_t;

void relay_ctrl_init(void);
bool relay_ctrl_is_reserved_gpio(int gpio_pin);
bool relay_ctrl_set_state(uint8_t channel_index, bool state_on, bool is_manual);
void relay_ctrl_tick_offline_schedules(void);
void relay_ctrl_apply_sync_json(const cJSON *relays_array, const cJSON *schedules_array_opt);
void relay_ctrl_append_status_json(cJSON *root_status);

#ifdef __cplusplus
}
#endif
