#include "power_calc.h"
#include "sensors.h"
#include "signal_processing.h"
#include <math.h>

power_metrics_t power_calc_compute(
    float *v_samples,
    float *i_samples,
    size_t count,
    float sample_rate_hz,
    float phase_correction_deg,
    float nominal_freq_hz
) {
    power_metrics_t out = {0};
    if (!v_samples || !i_samples || count == 0) {
        out.valid = false;
        return out;
    }

    // 1. Remove DC bias from both channels independently
    dsp_remove_dc_offset(v_samples, count);
    dsp_remove_dc_offset(i_samples, count);

    // 2. Apply calibrated CT phase-shift compensation
    dsp_apply_phase_correction(v_samples, i_samples, count, phase_correction_deg, sample_rate_hz, nominal_freq_hz);

    // 3. Simultaneous RMS & instantaneous active power integration (P = mean(v[n] * i[n]))
    double sum_v2 = 0.0;
    double sum_i2 = 0.0;
    double sum_vi = 0.0;

    for (size_t n = 0; n < count; n++) {
        double v = (double)v_samples[n];
        double i = (double)i_samples[n];
        if (!isfinite(v) || !isfinite(i)) {
            out.valid = false;
            return out;
        }
        sum_v2 += v * v;
        sum_i2 += i * i;
        sum_vi += v * i;
    }

    out.voltage_rms = (float)sqrt(sum_v2 / (double)count);
    out.current_rms = (float)sqrt(sum_i2 / (double)count);

    // Noise floor gating for zero-current standby
    if (out.current_rms < 0.03f) {
        out.current_rms = 0.0f;
        out.active_power_w = 0.0f;
    } else {
        out.active_power_w = (float)(sum_vi / (double)count);
    }

    out.apparent_power_va = out.voltage_rms * out.current_rms;
    if (out.apparent_power_va > 2.0f) {
        float pf = out.active_power_w / out.apparent_power_va;
        if (pf > 1.0f) pf = 1.0f;
        if (pf < -1.0f) pf = -1.0f;
        out.power_factor = pf;
    } else {
        out.power_factor = 0.0f;
    }

    out.frequency_hz = dsp_estimate_frequency_hz(v_samples, count, sample_rate_hz);
    out.valid = sensors_check_plausible(out.voltage_rms, out.current_rms);
    return out;
}
