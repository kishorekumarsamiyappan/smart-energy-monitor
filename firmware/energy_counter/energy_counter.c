#include "energy_counter.h"
#include "persistent_storage.h"
#include <math.h>

static double s_lifetime_kwh = 0.0;
static double s_last_saved_kwh = 0.0;
static uint32_t s_ticks_since_flush = 0;

void energy_counter_init(void) {
    double restored = 0.0;
    if (pstore_load_lifetime_kwh(&restored)) {
        s_lifetime_kwh = restored;
        s_last_saved_kwh = restored;
    } else {
        s_lifetime_kwh = 0.0;
        s_last_saved_kwh = 0.0;
    }
}

double energy_counter_integrate(float active_power_watts, double delta_seconds) {
    if (!isfinite(active_power_watts) || !isfinite(delta_seconds) || delta_seconds <= 0.0) {
        return s_lifetime_kwh;
    }
    // Only forward import power integrates into domestic billing energy counter
    if (active_power_watts > 0.5f) {
        double delta_kwh = ((double)active_power_watts * delta_seconds) / 3600000.0;
        s_lifetime_kwh += delta_kwh;
    }

    s_ticks_since_flush++;
    // Persist every 0.01 kWh increment or 60 intervals (~60s) to preserve NVS flash endurance
    if ((s_lifetime_kwh - s_last_saved_kwh) >= 0.01 || s_ticks_since_flush >= 60) {
        energy_counter_flush_now();
    }
    return s_lifetime_kwh;
}

double energy_counter_get_kwh(void) {
    return s_lifetime_kwh;
}

void energy_counter_flush_now(void) {
    if (pstore_save_lifetime_kwh(s_lifetime_kwh)) {
        s_last_saved_kwh = s_lifetime_kwh;
        s_ticks_since_flush = 0;
    }
}
