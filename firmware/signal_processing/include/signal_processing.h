#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

void dsp_remove_dc_offset(float *samples, size_t count);
void dsp_apply_phase_correction(const float *v_in, float *i_inout, size_t count, float phase_deg, float sample_rate_hz, float nominal_freq_hz);
float dsp_estimate_frequency_hz(const float *v_ac, size_t count, float sample_rate_hz);

#ifdef __cplusplus
}
#endif
