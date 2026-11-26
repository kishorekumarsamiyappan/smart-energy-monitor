#include "sensors.h"
#include <math.h>

void sensors_get_default_scaling(sensor_scaling_t *out) {
    if (!out) return;
    // Example scaling for ZMPT101B divider feeding ADS131M02 (+/-1.2V input range)
    // Must be verified against reference instrument on test bench before deployment.
    out->zmpt101b_v_per_adc_volt = 325.0f;
    // SCT-013 30A/1V has a built-in burden resistor outputting 1Vrms (1.414Vpk) at 30Arms.
    // With a 0.5x differential attenuator ahead of ADS131M02 (+/-1.2V FS): 60.0 A/V at ADC pins.
    out->sct013_amps_per_volt = 60.0f;
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
