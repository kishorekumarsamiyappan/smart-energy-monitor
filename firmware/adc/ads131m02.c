#include "ads131m02.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "soc/adc_channel.h"

static const char *TAG = "SEM_ADC";

// ESP32-S3 Internal 12-bit ADC1 channels matching bench-calibrated hardware:
// - ZMPT101B AC Voltage Sensor -> GPIO 4 (ADC1_CHANNEL_3)
// - SCT-013-000 (100A/50mA + 22 Ohm burden) AC Current Sensor -> GPIO 5 (ADC1_CHANNEL_4)
#define SEM_ADC_VOLT_CH ((adc_channel_t)ADC1_GPIO4_CHANNEL)
#define SEM_ADC_CURR_CH ((adc_channel_t)ADC1_GPIO5_CHANNEL)

static adc_oneshot_unit_handle_t s_adc_handle = NULL;
static bool s_adc_ok = false;

esp_err_t ads131m02_init(const ads131m02_config_t *cfg) {
    (void)cfg;
    if (s_adc_handle) {
        s_adc_ok = true;
        return ESP_OK;
    }

    adc_oneshot_unit_init_cfg_t unit_cfg = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    esp_err_t err = adc_oneshot_new_unit(&unit_cfg, &s_adc_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ADC1 unit init failed: %s", esp_err_to_name(err));
        s_adc_ok = false;
        return err;
    }

    adc_oneshot_chan_cfg_t chan_cfg = {
        .bitwidth = ADC_BITWIDTH_12,
        .atten = ADC_ATTEN_DB_12,
    };
    err = adc_oneshot_config_channel(s_adc_handle, SEM_ADC_VOLT_CH, &chan_cfg);
    if (err == ESP_OK) {
        err = adc_oneshot_config_channel(s_adc_handle, SEM_ADC_CURR_CH, &chan_cfg);
    }

    s_adc_ok = (err == ESP_OK);
    if (s_adc_ok) {
        ESP_LOGI(TAG, "Initialized ESP32-S3 12-bit ADC1 (ZMPT101B=GPIO4/CH%d, SCT013=GPIO5/CH%d)",
                 (int)SEM_ADC_VOLT_CH, (int)SEM_ADC_CURR_CH);
    } else {
        ESP_LOGE(TAG, "ADC1 channel config failed: %s", esp_err_to_name(err));
    }
    return err;
}

esp_err_t ads131m02_read_sample(ads131m02_sample_t *out_sample, uint32_t timeout_ms) {
    (void)timeout_ms;
    if (!out_sample) return ESP_ERR_INVALID_ARG;
    if (!s_adc_handle || !s_adc_ok) {
        out_sample->valid = false;
        return ESP_ERR_INVALID_STATE;
    }

    int v_raw = 0;
    int i_raw = 0;
    esp_err_t ev = adc_oneshot_read(s_adc_handle, SEM_ADC_VOLT_CH, &v_raw);
    esp_err_t ei = adc_oneshot_read(s_adc_handle, SEM_ADC_CURR_CH, &i_raw);
    if (ev != ESP_OK || ei != ESP_OK) {
        out_sample->valid = false;
        return ev != ESP_OK ? ev : ei;
    }

    out_sample->ch0_raw = v_raw;
    out_sample->ch1_raw = i_raw;
    out_sample->ch0_volts = ((float)v_raw * 3.3f) / 4095.0f;
    out_sample->ch1_volts = ((float)i_raw * 3.3f) / 4095.0f;
    out_sample->status_word = 0x0001;
    out_sample->valid = true;
    return ESP_OK;
}

bool ads131m02_is_spi_healthy(void) { return s_adc_ok; }
bool ads131m02_is_drdy_healthy(void) { return s_adc_ok; }
