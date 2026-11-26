#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * ADS131M02 Simultaneous 2-Channel 24-bit Delta-Sigma SPI ADC Driver.
 * Channel 0: Conditioned ZMPT101B AC voltage waveform
 * Channel 1: Conditioned SCT-013 (30A / 1V) AC current waveform
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
