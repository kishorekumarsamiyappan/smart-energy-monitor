idf_component_register(
    SRCS "ads131m02.c"
    INCLUDE_DIRS "include"
    REQUIRES driver freertos esp_timer esp_adc
)
