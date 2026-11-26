#include "calibration.h"
#include "persistent_storage.h"

static calibration_params_t s_current = {
    .voltage_cal_factor = 1.0f,
    .current_cal_factor = 1.0f,
    .phase_correction_deg = 0.8f,
    .nominal_frequency_hz = 50.0f,
};

void calibration_load(calibration_params_t *out) {
    pstore_load_calibration(&s_current.voltage_cal_factor, &s_current.current_cal_factor, &s_current.phase_correction_deg);
    if (out) *out = s_current;
}

void calibration_save(const calibration_params_t *params) {
    if (!params) return;
    if (params->voltage_cal_factor > 0.1f && params->voltage_cal_factor < 10.0f) {
        s_current.voltage_cal_factor = params->voltage_cal_factor;
    }
    if (params->current_cal_factor > 0.1f && params->current_cal_factor < 10.0f) {
        s_current.current_cal_factor = params->current_cal_factor;
    }
    if (params->phase_correction_deg >= -30.0f && params->phase_correction_deg <= 30.0f) {
        s_current.phase_correction_deg = params->phase_correction_deg;
    }
    pstore_save_calibration(s_current.voltage_cal_factor, s_current.current_cal_factor, s_current.phase_correction_deg);
}
