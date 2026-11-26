idf_component_register(
    SRCS "persistent_storage.c"
    INCLUDE_DIRS "include"
    REQUIRES nvs_flash
)
