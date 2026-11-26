#include "ads131m02.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include <string.h>

static const char *TAG = "ADS131M02";

#define ADS131M02_CMD_NULL      0x0000
#define ADS131M02_CMD_RESET     0x0011
#define ADS131M02_CMD_WREG(a,n) (0x6000 | (((a) & 0x3F) << 7) | (((n)-1) & 0x7F))
#define ADS131M02_REG_CLOCK     0x03
#define ADS131M02_REG_GAIN      0x04

// Internal +/- 1.2V reference for Gain = 1 (24-bit signed full-scale = 2^23 - 1)
#define ADS131M02_VREF_VOLTS    1.2f
#define ADS131M02_FULL_SCALE    8388608.0f

static spi_device_handle_t s_spi_dev = NULL;
static SemaphoreHandle_t s_drdy_sem = NULL;
static bool s_spi_ok = false;
static bool s_drdy_ok = false;
static int s_drdy_pin = -1;

static void IRAM_ATTR drdy_isr_handler(void *arg) {
    (void)arg;
    BaseType_t woken = pdFALSE;
    if (s_drdy_sem) {
        xSemaphoreGiveFromISR(s_drdy_sem, &woken);
    }
    if (woken) {
        portYIELD_FROM_ISR();
    }
}

static int32_t sign_extend_24bit(const uint8_t *b) {
    int32_t raw = ((int32_t)b[0] << 16) | ((int32_t)b[1] << 8) | (int32_t)b[2];
    if (raw & 0x00800000) {
        raw |= (int32_t)0xFF000000;
    }
    return raw;
}

static esp_err_t spi_transfer_frame(const uint8_t *tx, uint8_t *rx, size_t len) {
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.length = len * 8;
    t.tx_buffer = tx;
    t.rx_buffer = rx;
    return spi_device_polling_transmit(s_spi_dev, &t);
}

esp_err_t ads131m02_init(const ads131m02_config_t *cfg) {
    if (!cfg) return ESP_ERR_INVALID_ARG;
    s_drdy_pin = cfg->pin_drdy;
    s_drdy_sem = xSemaphoreCreateBinary();
    if (!s_drdy_sem) return ESP_ERR_NO_MEM;

    spi_bus_config_t buscfg = {
        .mosi_io_num = cfg->pin_mosi,
        .miso_io_num = cfg->pin_miso,
        .sclk_io_num = cfg->pin_sclk,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 32,
    };
    esp_err_t err = spi_bus_initialize((spi_host_device_t)cfg->spi_host, &buscfg, SPI_DMA_CH_AUTO);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        return err;
    }

    spi_device_interface_config_t devcfg = {
        .clock_speed_hz = (int)cfg->spi_clock_hz,
        .mode = 1, // ADS131M02 uses SPI Mode 1 (CPOL=0, CPHA=1)
        .spics_io_num = cfg->pin_cs,
        .queue_size = 2,
    };
    err = spi_bus_add_device((spi_host_device_t)cfg->spi_host, &devcfg, &s_spi_dev);
    if (err != ESP_OK) return err;

    // Configure DRDY falling-edge interrupt
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << cfg->pin_drdy),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .intr_type = GPIO_INTR_NEGEDGE,
    };
    gpio_config(&io_conf);
    gpio_install_isr_service(0);
    gpio_isr_handler_add((gpio_num_t)cfg->pin_drdy, drdy_isr_handler, NULL);

    // Hardware reset pulse if pin provided
    if (cfg->pin_sync_reset >= 0) {
        gpio_set_direction((gpio_num_t)cfg->pin_sync_reset, GPIO_MODE_OUTPUT);
        gpio_set_level((gpio_num_t)cfg->pin_sync_reset, 0);
        vTaskDelay(pdMS_TO_TICKS(2));
        gpio_set_level((gpio_num_t)cfg->pin_sync_reset, 1);
        vTaskDelay(pdMS_TO_TICKS(5));
    }

    // Send RESET frame and verify status response (expected 0xFF22 for 2-ch ADS131M02)
    uint8_t tx[12] = {0};
    uint8_t rx[12] = {0};
    tx[0] = (ADS131M02_CMD_RESET >> 8) & 0xFF;
    tx[1] = ADS131M02_CMD_RESET & 0xFF;
    err = spi_transfer_frame(tx, rx, sizeof(tx));
    vTaskDelay(pdMS_TO_TICKS(5));

    // Read STATUS via NULL frame
    memset(tx, 0, sizeof(tx));
    err = spi_transfer_frame(tx, rx, sizeof(tx));
    uint16_t status = ((uint16_t)rx[0] << 8) | rx[1];
    s_spi_ok = (err == ESP_OK) && (status != 0x0000) && (status != 0xFFFF);

    // Configure CLOCK register: enable CH0+CH1, OSR=1024 (~4 kSPS at 8.192 MHz CLKIN)
    uint16_t cmd_clk = ADS131M02_CMD_WREG(ADS131M02_REG_CLOCK, 1);
    tx[0] = (cmd_clk >> 8) & 0xFF;
    tx[1] = cmd_clk & 0xFF;
    tx[3] = 0x03; // Enable CH0, CH1
    tx[4] = 0x0E; // OSR=1024, High-Res mode
    spi_transfer_frame(tx, rx, sizeof(tx));

    ESP_LOGI(TAG, "Initialized ADS131M02 (status=0x%04X, spi_ok=%d)", status, s_spi_ok);
    return ESP_OK;
}

esp_err_t ads131m02_read_sample(ads131m02_sample_t *out_sample, uint32_t timeout_ms) {
    if (!out_sample || !s_spi_dev) return ESP_ERR_INVALID_STATE;
    memset(out_sample, 0, sizeof(*out_sample));

    if (xSemaphoreTake(s_drdy_sem, pdMS_TO_TICKS(timeout_ms)) != pdTRUE) {
        s_drdy_ok = false;
        return ESP_ERR_TIMEOUT;
    }
    s_drdy_ok = true;

    // Frame size: 24-bit words x 4 (STATUS, CH0, CH1, CRC) = 12 bytes
    uint8_t tx[12] = {0};
    uint8_t rx[12] = {0};
    esp_err_t err = spi_transfer_frame(tx, rx, sizeof(tx));
    if (err != ESP_OK) {
        s_spi_ok = false;
        return err;
    }

    out_sample->status_word = ((uint16_t)rx[0] << 8) | rx[1];
    out_sample->ch0_raw = sign_extend_24bit(&rx[3]);
    out_sample->ch1_raw = sign_extend_24bit(&rx[6]);
    out_sample->ch0_volts = ((float)out_sample->ch0_raw / ADS131M02_FULL_SCALE) * ADS131M02_VREF_VOLTS;
    out_sample->ch1_volts = ((float)out_sample->ch1_raw / ADS131M02_FULL_SCALE) * ADS131M02_VREF_VOLTS;

    // Validate status word indicates active SPI comms and ADC not stuck at +/- rail
    s_spi_ok = (out_sample->status_word != 0x0000 && out_sample->status_word != 0xFFFF);
    out_sample->valid = s_spi_ok &&
                        (out_sample->ch0_raw != 0x7FFFFF && out_sample->ch0_raw != -8388608) &&
                        (out_sample->ch1_raw != 0x7FFFFF && out_sample->ch1_raw != -8388608);
    return ESP_OK;
}

bool ads131m02_is_spi_healthy(void) { return s_spi_ok; }
bool ads131m02_is_drdy_healthy(void) { return s_drdy_ok; }
