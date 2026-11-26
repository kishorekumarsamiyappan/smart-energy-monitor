#include "led_indicator.h"
#include "driver/gpio.h"
#include "driver/rmt_tx.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs.h"
#include <string.h>

static const char *TAG = "SEM_LED";
static const char *NVS_IO_NS = "sem_io";
static SemaphoreHandle_t s_led_mtx = NULL;

static sem_led_io_config_t s_cfg = {
    .status_mode = STATUS_LED_MODE_INBUILT_RGB,
    .status_rgb_gpio = 48,
    .status_single_gpio = 2,
    .pulse_enabled = true,
    .pulse_gpio = 21,
    .pulse_imp_per_kwh = 1600,
};

static volatile sem_device_visual_state_t s_visual_state = LED_DEV_STATE_BLE_PROV;
static volatile uint32_t s_pending_pulses = 0;
static double s_wh_accum = 0.0;

static rmt_channel_handle_t s_rmt_chan = NULL;
static rmt_encoder_handle_t s_rmt_bytes = NULL;

static void write_ws2812_rgb(uint8_t r, uint8_t g, uint8_t b) {
    if (!s_rmt_chan || !s_rmt_bytes) return;
    // WS2812 expects GRB byte order at 10 MHz RMT resolution
    uint8_t grb[3] = {g, r, b};
    rmt_transmit_config_t tx_cfg = {.loop_count = 0};
    rmt_transmit(s_rmt_chan, s_rmt_bytes, grb, sizeof(grb), &tx_cfg);
    rmt_tx_wait_all_done(s_rmt_chan, pdMS_TO_TICKS(50));
}

static void init_gpio_pins(void) {
    if (s_rmt_chan) {
        rmt_disable(s_rmt_chan);
        rmt_del_channel(s_rmt_chan);
        s_rmt_chan = NULL;
    }
    if (s_cfg.status_mode == STATUS_LED_MODE_INBUILT_RGB && s_cfg.status_rgb_gpio >= 1 && s_cfg.status_rgb_gpio <= 48) {
        rmt_tx_channel_config_t rmt_cfg = {
            .clk_src = RMT_CLK_SRC_DEFAULT,
            .gpio_num = (gpio_num_t)s_cfg.status_rgb_gpio,
            .mem_block_symbols = 64,
            .resolution_hz = 10000000, // 100ns tick
            .trans_queue_depth = 4,
        };
        if (rmt_new_tx_channel(&rmt_cfg, &s_rmt_chan) == ESP_OK) {
            if (!s_rmt_bytes) {
                rmt_bytes_encoder_config_t bcfg = {
                    .bit0 = {.level0 = 1, .duration0 = 3, .level1 = 0, .duration1 = 9},
                    .bit1 = {.level0 = 1, .duration0 = 9, .level1 = 0, .duration1 = 3},
                    .flags.msb_first = 1,
                };
                rmt_new_bytes_encoder(&bcfg, &s_rmt_bytes);
            }
            rmt_enable(s_rmt_chan);
        }
    }

    if (s_cfg.status_single_gpio >= 1 && s_cfg.status_single_gpio <= 48) {
        gpio_config_t io = {
            .pin_bit_mask = (1ULL << s_cfg.status_single_gpio),
            .mode = GPIO_MODE_OUTPUT,
        };
        gpio_config(&io);
        gpio_set_level((gpio_num_t)s_cfg.status_single_gpio, 0);
    }

    if (s_cfg.pulse_gpio >= 1 && s_cfg.pulse_gpio <= 48) {
        gpio_config_t io = {
            .pin_bit_mask = (1ULL << s_cfg.pulse_gpio),
            .mode = GPIO_MODE_OUTPUT,
        };
        gpio_config(&io);
        gpio_set_level((gpio_num_t)s_cfg.pulse_gpio, 0);
    }
}

static void led_service_task(void *arg) {
    (void)arg;
    uint32_t tick = 0;
    while (1) {
        // 1. Handle External Consumption Pulse LED blink
        if (s_cfg.pulse_enabled && s_pending_pulses > 0 && s_cfg.pulse_gpio >= 1 && s_cfg.pulse_gpio <= 48) {
            s_pending_pulses--;
            gpio_set_level((gpio_num_t)s_cfg.pulse_gpio, 1);
            vTaskDelay(pdMS_TO_TICKS(40));
            gpio_set_level((gpio_num_t)s_cfg.pulse_gpio, 0);
        }

        // 2. Drive Status LED (Inbuilt RGB OR Single Monochrome LED)
        if (s_led_mtx) xSemaphoreTake(s_led_mtx, portMAX_DELAY);
        sem_device_visual_state_t st = s_visual_state;
        bool on_phase = (tick % 4) < 2;
        bool fast_phase = (tick % 2) == 0;
        bool dbl_phase = (tick % 8 == 0) || (tick % 8 == 2);

        if (s_cfg.status_mode == STATUS_LED_MODE_INBUILT_RGB) {
            switch (st) {
                case LED_DEV_STATE_ONLINE:         write_ws2812_rgb(0, 36, 12); break;
                case LED_DEV_STATE_OFFLINE_BUFFER: write_ws2812_rgb(on_phase ? 40 : 6, on_phase ? 20 : 3, 0); break;
                case LED_DEV_STATE_BLE_PROV:       write_ws2812_rgb(0, 10, on_phase ? 48 : 4); break;
                case LED_DEV_STATE_FOTA:           write_ws2812_rgb(0, fast_phase ? 42 : 4, fast_phase ? 48 : 8); break;
                case LED_DEV_STATE_FAULT:          write_ws2812_rgb(fast_phase ? 50 : 0, 0, 0); break;
            }
        } else if (s_cfg.status_mode == STATUS_LED_MODE_SINGLE_GPIO) {
            int lvl = 0;
            switch (st) {
                case LED_DEV_STATE_ONLINE:         lvl = 1; break;
                case LED_DEV_STATE_OFFLINE_BUFFER: lvl = dbl_phase ? 1 : 0; break;
                case LED_DEV_STATE_BLE_PROV:       lvl = on_phase ? 1 : 0; break;
                case LED_DEV_STATE_FOTA:           lvl = fast_phase ? 1 : 0; break;
                case LED_DEV_STATE_FAULT:          lvl = fast_phase ? 1 : 0; break;
            }
            gpio_set_level((gpio_num_t)s_cfg.status_single_gpio, lvl);
        } else {
            write_ws2812_rgb(0, 0, 0);
            gpio_set_level((gpio_num_t)s_cfg.status_single_gpio, 0);
        }
        if (s_led_mtx) xSemaphoreGive(s_led_mtx);

        tick++;
        vTaskDelay(pdMS_TO_TICKS(150));
    }
}

void led_ind_init(void) {
    if (!s_led_mtx) s_led_mtx = xSemaphoreCreateMutex();
    nvs_handle_t h;
    if (nvs_open(NVS_IO_NS, NVS_READONLY, &h) == ESP_OK) {
        size_t sz = sizeof(s_cfg);
        nvs_get_blob(h, "cfg", &s_cfg, &sz);
        nvs_close(h);
    }
    init_gpio_pins();
    xTaskCreate(led_service_task, "sem_led", 3072, NULL, 3, NULL);
    ESP_LOGI(TAG, "LED indicator ready (status_mode=%d, pulse_gpio=%d, %d imp/kWh)",
             (int)s_cfg.status_mode, s_cfg.pulse_gpio, s_cfg.pulse_imp_per_kwh);
}

void led_ind_set_visual_state(sem_device_visual_state_t state) {
    s_visual_state = state;
}

void led_ind_on_power_sample(float active_power_w, double dt_sec) {
    if (!s_cfg.pulse_enabled || active_power_w <= 1.0f || dt_sec <= 0.0) return;
    double wh = ((double)active_power_w * dt_sec) / 3600.0;
    double wh_per_pulse = 1000.0 / (double)(s_cfg.pulse_imp_per_kwh > 0 ? s_cfg.pulse_imp_per_kwh : 1000);
    s_wh_accum += wh;
    while (s_wh_accum >= wh_per_pulse) {
        s_wh_accum -= wh_per_pulse;
        if (s_pending_pulses < 10) s_pending_pulses++;
    }
}

void led_ind_apply_config_json(const cJSON *io_cfg) {
    if (!cJSON_IsObject(io_cfg)) return;
    if (s_led_mtx) xSemaphoreTake(s_led_mtx, portMAX_DELAY);
    const cJSON *mode = cJSON_GetObjectItem(io_cfg, "status_mode");
    if (!mode) mode = cJSON_GetObjectItem(io_cfg, "status_led_mode");
    const cJSON *rgb_g = cJSON_GetObjectItem(io_cfg, "rgb_gpio");
    if (!rgb_g) rgb_g = cJSON_GetObjectItem(io_cfg, "status_rgb_gpio");
    const cJSON *single_g = cJSON_GetObjectItem(io_cfg, "single_gpio");
    if (!single_g) single_g = cJSON_GetObjectItem(io_cfg, "status_single_led_gpio");
    const cJSON *p_en = cJSON_GetObjectItem(io_cfg, "pulse_enabled");
    if (!p_en) p_en = cJSON_GetObjectItem(io_cfg, "pulse_led_enabled");
    const cJSON *p_g = cJSON_GetObjectItem(io_cfg, "pulse_gpio");
    if (!p_g) p_g = cJSON_GetObjectItem(io_cfg, "pulse_led_gpio");
    const cJSON *p_imp = cJSON_GetObjectItem(io_cfg, "imp_per_kwh");
    if (!p_imp) p_imp = cJSON_GetObjectItem(io_cfg, "pulse_imp_per_kwh");

    if (cJSON_IsString(mode)) {
        if (strcmp(mode->valuestring, "inbuilt_rgb") == 0) s_cfg.status_mode = STATUS_LED_MODE_INBUILT_RGB;
        else if (strcmp(mode->valuestring, "single_gpio") == 0) s_cfg.status_mode = STATUS_LED_MODE_SINGLE_GPIO;
        else if (strcmp(mode->valuestring, "disabled") == 0) s_cfg.status_mode = STATUS_LED_MODE_DISABLED;
    }
    if (cJSON_IsNumber(rgb_g)) s_cfg.status_rgb_gpio = rgb_g->valueint;
    if (cJSON_IsNumber(single_g)) s_cfg.status_single_gpio = single_g->valueint;
    if (cJSON_IsBool(p_en)) s_cfg.pulse_enabled = cJSON_IsTrue(p_en);
    if (cJSON_IsNumber(p_g)) s_cfg.pulse_gpio = p_g->valueint;
    if (cJSON_IsNumber(p_imp) && p_imp->valueint >= 100) s_cfg.pulse_imp_per_kwh = p_imp->valueint;

    nvs_handle_t h;
    if (nvs_open(NVS_IO_NS, NVS_READWRITE, &h) == ESP_OK) {
        nvs_set_blob(h, "cfg", &s_cfg, sizeof(s_cfg));
        nvs_commit(h);
        nvs_close(h);
    }
    init_gpio_pins();
    if (s_led_mtx) xSemaphoreGive(s_led_mtx);
}
