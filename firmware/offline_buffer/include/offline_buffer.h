#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float voltage_rms;
    float current_rms;
    float active_power_w;
    float apparent_power_va;
    float power_factor;
    float frequency_hz;
    double energy_kwh;
    int wifi_rssi;
    uint32_t seq;
    char timestamp_iso[40];
} offline_sample_t;

typedef bool (*offline_drain_cb_t)(const offline_sample_t *sample);

void offline_buffer_init(void);
void offline_buffer_set_enabled(bool enabled);
bool offline_buffer_is_enabled(void);
bool offline_buffer_push(const offline_sample_t *sample);
int offline_buffer_drain(offline_drain_cb_t publish_cb, int max_items);
uint32_t offline_buffer_get_count(void);

#ifdef __cplusplus
}
#endif
