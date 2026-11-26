idf_component_register(
    SRCS "led_indicator.c"
    INCLUDE_DIRS "include"
    REQUIRES driver nvs_flash esp_timer freertos log json
)
