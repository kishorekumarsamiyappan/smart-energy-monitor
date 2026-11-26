idf_component_register(
    SRCS "mqtt_client_app.c"
    INCLUDE_DIRS "include"
    REQUIRES mqtt json calibration energy_counter persistent_storage
             offline_buffer relay_controller led_indicator fota
)
