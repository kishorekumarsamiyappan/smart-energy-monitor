#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*sem_mqtt_state_cb_t)(bool connected, bool auth_failed);

typedef struct {
    const char *broker_uri;   // e.g. "mqtts://your-emqx-host:8883"
    const char *ca_cert_pem;  // Root CA PEM string for TLS server verification
    const char *device_id;
    const char *mqtt_user;
    const char *mqtt_pass;
    const char *firmware_version;
    sem_mqtt_state_cb_t on_state;
} sem_mqtt_config_t;

void sem_mqtt_format_ist_iso8601(char *buf, size_t len);
void sem_mqtt_start(const sem_mqtt_config_t *cfg);
bool sem_mqtt_is_connected(void);
int sem_mqtt_get_interval_sec(void);
bool sem_mqtt_publish_telemetry(
    const char *device_id,
    float v_rms,
    float i_rms,
    float active_p,
    float apparent_p,
    float pf,
    float freq_hz,
    double energy_kwh,
    int wifi_rssi,
    uint32_t seq,
    const char *timestamp_iso_opt,
    bool buffered
);
void sem_mqtt_publish_alert(const char *device_id, const char *alert_type, float observed, const char *msg);
void sem_mqtt_publish_status(const char *status_str, const char *ota_status, int ota_progress_pct, const char *ota_version);

#ifdef __cplusplus
}
#endif
