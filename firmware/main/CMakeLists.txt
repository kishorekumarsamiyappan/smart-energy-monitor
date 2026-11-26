idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES adc sensors signal_processing power_calculation energy_counter calibration
             ble_provisioning wifi_manager mqtt_client persistent_storage watchdog
             offline_buffer relay_controller led_indicator fota driver freertos
)
