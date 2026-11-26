idf_component_register(
    SRCS "watchdog.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_system esp_timer
)
