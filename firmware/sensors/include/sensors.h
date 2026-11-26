#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Hardware Analog Front-End Scaling:
 * - Voltage: ZMPT101B conditioned differential/biased waveform into ADS131M02 Ch0
 * - Current: SCT-013 30A / 1V voltage-output CT (BUILT-IN burden resistor — do NOT add external burden)
 */
typedef struct {
    float zmpt101b_v_per_adc_volt; // Bench-calibrated mains V / ADC differential V
    float sct013_amps_per_volt;    // Nominal 30.0 A / 1.0 Vrms = 30.0 (adjusted by attenuation if any)
} sensor_scaling_t;

void sensors_get_default_scaling(sensor_scaling_t *out);
float sensors_adc_to_mains_voltage(float adc_ch0_volts, float v_scale, float v_cal_factor);
float sensors_adc_to_mains_current(float adc_ch1_volts, float i_scale, float i_cal_factor);
bool sensors_check_plausible(float v_rms, float i_rms);

#ifdef __cplusplus
}
#endif
