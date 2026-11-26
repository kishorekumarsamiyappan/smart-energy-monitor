#pragma once

#include <stdbool.h>
#include <stddef.h>

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
    bool valid;
} power_metrics_t;

power_metrics_t power_calc_compute(
    float *v_samples,
    float *i_samples,
    size_t count,
    float sample_rate_hz,
    float phase_correction_deg,
    float nominal_freq_hz
);

#ifdef __cplusplus
}
#endif
