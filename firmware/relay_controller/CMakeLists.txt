idf_component_register(
    SRCS "relay_controller.c"
    INCLUDE_DIRS "include"
    REQUIRES driver nvs_flash freertos log json
)
