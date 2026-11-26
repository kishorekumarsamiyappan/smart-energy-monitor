cmake_minimum_required(VERSION 3.16)

# Register modular components located directly under firmware/
set(EXTRA_COMPONENT_DIRS
    "${CMAKE_CURRENT_LIST_DIR}/adc"
    "${CMAKE_CURRENT_LIST_DIR}/sensors"
    "${CMAKE_CURRENT_LIST_DIR}/signal_processing"
    "${CMAKE_CURRENT_LIST_DIR}/power_calculation"
    "${CMAKE_CURRENT_LIST_DIR}/energy_counter"
    "${CMAKE_CURRENT_LIST_DIR}/calibration"
    "${CMAKE_CURRENT_LIST_DIR}/ble_provisioning"
    "${CMAKE_CURRENT_LIST_DIR}/wifi_manager"
    "${CMAKE_CURRENT_LIST_DIR}/mqtt_client"
    "${CMAKE_CURRENT_LIST_DIR}/persistent_storage"
    "${CMAKE_CURRENT_LIST_DIR}/watchdog"
    "${CMAKE_CURRENT_LIST_DIR}/offline_buffer"
    "${CMAKE_CURRENT_LIST_DIR}/relay_controller"
    "${CMAKE_CURRENT_LIST_DIR}/led_indicator"
    "${CMAKE_CURRENT_LIST_DIR}/fota"
)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(smart_energy_monitor_esp32s3)
