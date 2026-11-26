idf_component_register(
    SRCS "fota_manager.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_https_ota esp_http_client app_update mbedtls energy_counter led_indicator log freertos
)
