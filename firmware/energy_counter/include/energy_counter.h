#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Monotonic Lifetime Energy Accumulator (kWh).
 * NEVER reset when billing cycle changes; persisted across power cycles via NVS double-buffer.
 */
void energy_counter_init(void);
double energy_counter_integrate(float active_power_watts, double delta_seconds);
double energy_counter_get_kwh(void);
void energy_counter_flush_now(void);

#ifdef __cplusplus
}
#endif
