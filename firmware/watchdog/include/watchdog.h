#pragma once

#ifdef __cplusplus
extern "C" {
#endif

void sem_watchdog_init(void);
void sem_watchdog_add_current_task(void);
void sem_watchdog_feed(void);
void sem_watchdog_log_error(const char *source, const char *message);

#ifdef __cplusplus
}
#endif
