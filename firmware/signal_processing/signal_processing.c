#include "signal_processing.h"
#include <math.h>
#include <stdbool.h>
#include <stdlib.h>

void dsp_remove_dc_offset(float *samples, size_t count) {
    if (!samples || count == 0) return;
    double sum = 0.0;
    for (size_t i = 0; i < count; i++) {
        sum += samples[i];
    }
    float mean = (float)(sum / (double)count);
    for (size_t i = 0; i < count; i++) {
        samples[i] -= mean;
    }
}

void dsp_apply_phase_correction(
    const float *v_in,
    float *i_inout,
    size_t count,
    float phase_deg,
    float sample_rate_hz,
    float nominal_freq_hz
) {
    (void)v_in;
    if (!i_inout || count < 3 || fabsf(phase_deg) < 0.001f || sample_rate_hz <= 0.0f) return;

    // Convert phase error (degrees at nominal_freq_hz) into fractional samples
    double samples_per_cycle = (double)sample_rate_hz / (double)nominal_freq_hz;
    double shift_samples = ((double)phase_deg / 360.0) * samples_per_cycle;

    // Linear fractional interpolation: i_corr[n] = i[n] + shift * (i[n] - i[n-1]) for small |shift| < 1
    // Supports larger integer shifts via index offset
    int int_shift = (int)floor(shift_samples);
    float frac = (float)(shift_samples - (double)int_shift);

    float *tmp = (float *)malloc(count * sizeof(float));
    if (!tmp) return;

    for (size_t n = 0; n < count; n++) {
        int idx0 = (int)n + int_shift;
        int idx1 = idx0 + 1;
        if (idx0 < 0) idx0 = 0;
        if (idx0 >= (int)count) idx0 = (int)count - 1;
        if (idx1 < 0) idx1 = 0;
        if (idx1 >= (int)count) idx1 = (int)count - 1;
        tmp[n] = i_inout[idx0] + frac * (i_inout[idx1] - i_inout[idx0]);
    }
    for (size_t n = 0; n < count; n++) {
        i_inout[n] = tmp[n];
    }
    free(tmp);
}

float dsp_estimate_frequency_hz(const float *v_ac, size_t count, float sample_rate_hz) {
    if (!v_ac || count < 10 || sample_rate_hz <= 0.0f) return 0.0f;

    // Find peak amplitude for hysteresis threshold (ignore noise when mains is off)
    float peak = 0.0f;
    for (size_t i = 0; i < count; i++) {
        float a = fabsf(v_ac[i]);
        if (a > peak) peak = a;
    }
    if (peak < 15.0f) return 0.0f; // Mains disconnected

    float hyst = peak * 0.08f;
    bool armed = false;
    double first_cross = -1.0;
    double last_cross = -1.0;
    int cycles = 0;

    for (size_t i = 1; i < count; i++) {
        if (v_ac[i] < -hyst) {
            armed = true;
        } else if (armed && v_ac[i - 1] <= 0.0f && v_ac[i] > 0.0f) {
            // Sub-sample linear interpolation for rising zero crossing
            float denom = v_ac[i] - v_ac[i - 1];
            double frac = (fabsf(denom) > 1e-6f) ? (double)(-v_ac[i - 1]) / (double)denom : 0.0;
            double cross_idx = (double)(i - 1) + frac;
            if (first_cross < 0.0) {
                first_cross = cross_idx;
            } else {
                last_cross = cross_idx;
                cycles++;
            }
            armed = false;
        }
    }

    if (cycles < 2 || last_cross <= first_cross) return 0.0f;
    double avg_period_samples = (last_cross - first_cross) / (double)cycles;
    float freq = (float)((double)sample_rate_hz / avg_period_samples);
    if (freq < 40.0f || freq > 70.0f) return 0.0f;
    return freq;
}
