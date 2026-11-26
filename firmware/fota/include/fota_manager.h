#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*fota_status_cb_t)(const char *status, int progress_pct, const char *version, const char *error_msg);

void fota_manager_confirm_boot_image(void);
bool fota_manager_start(const char *binary_url, const char *target_version, fota_status_cb_t status_cb);

#ifdef __cplusplus
}
#endif
