#include "watchdog.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"

static const char *TAG = "SEM_WDT";

void sem_watchdog_init(void) {
    esp_reset_reason_t reason = esp_reset_reason();
    ESP_LOGI(TAG, "Boot reset reason code: %d", (int)reason);
}

void sem_watchdog_add_current_task(void) {
    esp_task_wdt_add(NULL);
}

void sem_watchdog_feed(void) {
    esp_task_wdt_reset();
}

void sem_watchdog_log_error(const char *source, const char *message) {
    int64_t up_ms = esp_timer_get_time() / 1000;
    ESP_LOGE(TAG, "[+%lldms] %s: %s", (long long)up_ms, source ? source : "SYS", message ? message : "err");
}
