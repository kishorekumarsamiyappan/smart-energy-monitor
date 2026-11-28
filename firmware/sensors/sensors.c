#include "sensors.h"
#include <math.h>

void sensors_get_default_scaling(sensor_scaling_t *out) {
    if (!out) return;
    // Calibrated ZMPT101B constant on ESP32-S3 GPIO 4 (12-bit ADC_ATTEN_DB_12)
    out->zmpt101b_v_per_adc_volt = 311.5f;
    // Calibrated SCT-013-000 (100A/50mA + 22 Ohm burden) constant on ESP32-S3 GPIO 5
    out->sct013_amps_per_volt = 23.202f;
}

float sensors_adc_to_mains_voltage(float adc_ch0_volts, float v_scale, float v_cal_factor) {
    return adc_ch0_volts * v_scale * v_cal_factor;
}

float sensors_adc_to_mains_current(float adc_ch1_volts, float i_scale, float i_cal_factor) {
    return adc_ch1_volts * i_scale * i_cal_factor;
}

bool sensors_check_plausible(float v_rms, float i_rms) {
    if (!isfinite(v_rms) || !isfinite(i_rms)) return false;
    if (v_rms < 0.0f || v_rms > 450.0f) return false;
    if (i_rms < 0.0f || i_rms > 100.0f) return false;
    return true;
}
