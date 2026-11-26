#include "fota_manager.h"
#include "energy_counter.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_indicator.h"
#include <stdlib.h>
#include <string.h>

static const char *TAG = "SEM_FOTA";
static bool s_in_progress = false;

typedef struct {
    char url[512];
    char version[40];
    fota_status_cb_t cb;
} fota_job_args_t;

void fota_manager_confirm_boot_image(void) {
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    if (esp_ota_get_state_partition(running, &state) == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY) {
        esp_ota_mark_app_valid_cancel_rollback();
        ESP_LOGI(TAG, "Confirmed newly booted FOTA partition valid (rollback cancelled)");
    }
}

static void fota_worker_task(void *pv) {
    fota_job_args_t *args = (fota_job_args_t *)pv;
    led_ind_set_visual_state(LED_DEV_STATE_FOTA);

    if (args->cb) args->cb("downloading", 10, args->version, NULL);

    esp_http_client_config_t http_cfg = {
        .url = args->url,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 20000,
        .keep_alive_enable = true,
        .max_redirection_count = 6, // Follow GitHub Releases -> objects.githubusercontent.com CDN redirect
        .buffer_size = 4096,
        .buffer_size_tx = 2048,
    };

    esp_https_ota_config_t ota_cfg = {
        .http_config = &http_cfg,
    };

    esp_https_ota_handle_t ota_handle = NULL;
    esp_err_t err = esp_https_ota_begin(&ota_cfg, &ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_https_ota_begin failed: %s", esp_err_to_name(err));
        if (args->cb) args->cb("failed", 0, args->version, esp_err_to_name(err));
        s_in_progress = false;
        free(args);
        vTaskDelete(NULL);
        return;
    }

    int total_len = esp_https_ota_get_image_size(ota_handle);
    int last_reported_pct = 10;

    while (1) {
        err = esp_https_ota_perform(ota_handle);
        if (err != ESP_ERR_HTTPS_OTA_IN_PROGRESS) break;

        if (total_len > 0) {
            int read_len = esp_https_ota_get_image_len_read(ota_handle);
            int pct = 10 + (int)(((int64_t)read_len * 80) / total_len);
            if (pct - last_reported_pct >= 15) {
                last_reported_pct = pct;
                if (args->cb) args->cb("downloading", pct, args->version, NULL);
            }
        }
    }

    if (err == ESP_OK && esp_https_ota_is_complete_data_received(ota_handle)) {
        if (args->cb) args->cb("flashing", 95, args->version, NULL);
        esp_err_t fin = esp_https_ota_finish(ota_handle);
        if (fin == ESP_OK) {
            energy_counter_flush_now(); // Never lose lifetime kWh across OTA reboot
            if (args->cb) args->cb("succeeded", 100, args->version, NULL);
            ESP_LOGI(TAG, "GitHub FOTA update v%s succeeded; rebooting...", args->version);
            vTaskDelay(pdMS_TO_TICKS(1000));
            esp_restart();
        } else {
            if (args->cb) args->cb("failed", 0, args->version, esp_err_to_name(fin));
        }
    } else {
        esp_https_ota_abort(ota_handle);
        if (args->cb) args->cb("failed", 0, args->version, esp_err_to_name(err));
    }

    s_in_progress = false;
    free(args);
    vTaskDelete(NULL);
}

bool fota_manager_start(const char *binary_url, const char *target_version, fota_status_cb_t status_cb) {
    if (s_in_progress || !binary_url || strncmp(binary_url, "https://", 8) != 0) {
        return false;
    }
    fota_job_args_t *args = (fota_job_args_t *)calloc(1, sizeof(fota_job_args_t));
    if (!args) return false;
    snprintf(args->url, sizeof(args->url), "%s", binary_url);
    snprintf(args->version, sizeof(args->version), "%s", target_version ? target_version : "unknown");
    args->cb = status_cb;

    s_in_progress = true;
    xTaskCreate(fota_worker_task, "sem_fota", 8192, args, 6, NULL);
    return true;
}
