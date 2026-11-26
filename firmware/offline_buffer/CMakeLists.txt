idf_component_register(
    SRCS "offline_buffer.c"
    INCLUDE_DIRS "include"
    REQUIRES spiffs esp_timer freertos log json
)
