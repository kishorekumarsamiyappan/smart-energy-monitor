#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * ESP32-S3 Internal 2-Channel 12-bit ADC1 Driver (legacy ADS131M02 API interface).
 * Channel 0 (GPIO 4): Conditioned ZMPT101B AC voltage waveform
 * Channel 1 (GPIO 5): Conditioned SCT-013-000 (100A / 50mA + 22 Ohm external burden) AC current waveform
 */
typedef struct {
    int spi_host;
    int pin_mosi;
    int pin_miso;
    int pin_sclk;
    int pin_cs;
    int pin_drdy;
    int pin_sync_reset;
    uint32_t spi_clock_hz;
} ads131m02_config_t;

typedef struct {
    int32_t ch0_raw;
    int32_t ch1_raw;
    float ch0_volts;
    float ch1_volts;
    uint16_t status_word;
    bool valid;
} ads131m02_sample_t;

esp_err_t ads131m02_init(const ads131m02_config_t *cfg);
esp_err_t ads131m02_read_sample(ads131m02_sample_t *out_sample, uint32_t timeout_ms);
bool ads131m02_is_spi_healthy(void);
bool ads131m02_is_drdy_healthy(void);

#ifdef __cplusplus
}
#endif
