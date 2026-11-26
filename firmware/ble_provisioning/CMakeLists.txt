idf_component_register(
    SRCS "ble_provisioning.c"
    INCLUDE_DIRS "include"
    REQUIRES bt nvs_flash json persistent_storage
)
