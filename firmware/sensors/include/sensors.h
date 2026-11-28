#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Hardware Analog Front-End Scaling:
 * - Voltage: ZMPT101B AC voltage sensor module into ESP32-S3 GPIO 4 (ADC1_CH3)
 * - Current: SCT-013-000 (100 A / 50 mA) current-output CT with external 22 Ohm burden resistor + bias on GPIO 5 (ADC1_CH4)
 */
typedef struct {
    float zmpt101b_v_per_adc_volt; // Bench-calibrated mains V / ADC V (311.5)
    float sct013_amps_per_volt;    // Bench-calibrated A / ADC V for SCT-013-000 (100A/50mA + 22 Ohm burden = 23.202)
} sensor_scaling_t;

void sensors_get_default_scaling(sensor_scaling_t *out);
float sensors_adc_to_mains_voltage(float adc_ch0_volts, float v_scale, float v_cal_factor);
float sensors_adc_to_mains_current(float adc_ch1_volts, float i_scale, float i_cal_factor);
bool sensors_check_plausible(float v_rms, float i_rms);

#ifdef __cplusplus
}
#endif
