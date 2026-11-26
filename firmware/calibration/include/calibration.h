#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float voltage_cal_factor;
    float current_cal_factor;
    float phase_correction_deg;
    float nominal_frequency_hz;
} calibration_params_t;

void calibration_load(calibration_params_t *out);
void calibration_save(const calibration_params_t *params);

#ifdef __cplusplus
}
#endif
