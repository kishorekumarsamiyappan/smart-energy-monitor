#include "ads131m02.h"
#include "ble_provisioning.h"
#include "calibration.h"
#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "energy_counter.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "fota_manager.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_indicator.h"
#include "mqtt_client_app.h"
#include "offline_buffer.h"
#include "persistent_storage.h"
#include "power_calc.h"
#include "relay_controller.h"
#include "sensors.h"
#include "watchdog.h"
#include "wifi_manager.h"
#include <stdio.h>
#include <string.h>

static const char *TAG = "SEM_MAIN";
#define SEM_FIRMWARE_VERSION "1.3.0"

// Default ESP32-S3 SPI & ADC Pin Mapping (verify against schematic before PCB
// bring-up)
#define PIN_ADC_MOSI 11
#define PIN_ADC_MISO 13
#define PIN_ADC_SCLK 12
#define PIN_ADC_CS 10
#define PIN_ADC_DRDY 9
#define PIN_ADC_RESET 14
#define PIN_PROV_BTN 0

// Sample buffer: 1 second window @ 4000 SPS (80 cycles at 50Hz; adjust to
// hardware OSR)
#define SAMPLE_RATE_HZ 4000.0f
#define WINDOW_SAMPLES 4000

// EMQX Cloud Serverless TLS Root CA (DigiCert Global Root G2 - valid until 2038)
static const char *DEFAULT_CA_PEM =
    "-----BEGIN CERTIFICATE-----\n"
    "MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh\n"
    "MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3\n"
    "d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH\n"
    "MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT\n"
    "MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j\n"
    "b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG\n"
    "9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI\n"
    "2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx\n"
    "1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ\n"
    "q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz\n"
    "tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ\n"
    "vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP\n"
    "BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV\n"
    "5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY\n"
    "1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4\n"
    "NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG\n"
    "Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91\n"
    "8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe\n"
    "pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl\n"
    "MrY=\n"
    "-----END CERTIFICATE-----\n";
static const char *DEFAULT_BROKER_URI =
    "mqtts://z3af2919.ala.asia-southeast1.emqxsl.com:8883";

static char s_device_id[64] = "SEM_ESP32S3_01";
static char s_mqtt_user[64] = "";
static char s_mqtt_pass[64] = "";

static float s_v_buf[WINDOW_SAMPLES];
static float s_i_buf[WINDOW_SAMPLES];

static void on_ble_provisioned(void) { wifi_mgr_reconnect_with_nvs(); }

static bool drain_offline_sample_cb(const offline_sample_t *s) {
  return sem_mqtt_publish_telemetry(
      s_device_id, s->voltage_rms, s->current_rms, s->active_power_w,
      s->apparent_power_va, s->power_factor, s->frequency_hz, s->energy_kwh,
      s->wifi_rssi, s->seq, s->timestamp_iso, true);
}

static void measurement_task(void *arg) {
  (void)arg;
  sem_watchdog_add_current_task();

  sensor_scaling_t scaling;
  sensors_get_default_scaling(&scaling);

  calibration_params_t cal;
  calibration_load(&cal);

  uint32_t seq = 0;
  int64_t last_publish_us = esp_timer_get_time();
  int64_t last_energy_us = last_publish_us;

  while (1) {
    size_t collected = 0;
    size_t invalid_count = 0;

    for (size_t i = 0; i < WINDOW_SAMPLES; i++) {
      ads131m02_sample_t sample;
      if (ads131m02_read_sample(&sample, 20) == ESP_OK && sample.valid) {
        s_v_buf[collected] = sensors_adc_to_mains_voltage(
            sample.ch0_volts, scaling.zmpt101b_v_per_adc_volt,
            cal.voltage_cal_factor);
        s_i_buf[collected] = sensors_adc_to_mains_current(
            sample.ch1_volts, scaling.sct013_amps_per_volt,
            cal.current_cal_factor);
        collected++;
      } else {
        invalid_count++;
      }
      if ((i & 0xFF) == 0) {
        sem_watchdog_feed();
      }
    }

    // Autonomous local RTC relay scheduling continues every loop even when
    // offline
    relay_ctrl_tick_offline_schedules();

    if (collected < WINDOW_SAMPLES / 2) {
      sem_watchdog_log_error(
          "ADC", "Insufficient valid ADS131M02 samples in 1s window");
      led_ind_set_visual_state(LED_DEV_STATE_FAULT);
      sem_mqtt_publish_alert(s_device_id, "sensor_failure",
                             (float)invalid_count, "ADS131M02 DRDY/SPI fault");
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    calibration_load(&cal);
    power_metrics_t m =
        power_calc_compute(s_v_buf, s_i_buf, collected, SAMPLE_RATE_HZ,
                           cal.phase_correction_deg, cal.nominal_frequency_hz);

    int64_t now_us = esp_timer_get_time();
    double dt_sec = (double)(now_us - last_energy_us) / 1000000.0;
    last_energy_us = now_us;

    double total_kwh = energy_counter_get_kwh();
    if (m.valid) {
      total_kwh = energy_counter_integrate(m.active_power_w, dt_sec);
      // Blink external consumption LED proportionally to electrical energy
      // usage
      led_ind_on_power_sample(m.active_power_w, dt_sec);
    } else {
      sem_watchdog_log_error("MEAS",
                             "Implausible electrical metrics discarded");
    }

    int interval_s = sem_mqtt_get_interval_sec();
    if ((now_us - last_publish_us) >= (int64_t)interval_s * 1000000LL) {
      last_publish_us = now_us;
      if (m.valid) {
        seq++;
        if (sem_mqtt_is_connected()) {
          // Drain up to 10 buffered historical records first so cloud backfills
          // cleanly
          if (offline_buffer_get_count() > 0) {
            offline_buffer_drain(drain_offline_sample_cb, 10);
          }
          sem_mqtt_publish_telemetry(s_device_id, m.voltage_rms, m.current_rms,
                                     m.active_power_w, m.apparent_power_va,
                                     m.power_factor, m.frequency_hz, total_kwh,
                                     wifi_mgr_get_rssi(), seq, NULL, false);
          led_ind_set_visual_state(LED_DEV_STATE_ONLINE);
          ble_prov_set_status("MQTT_READY");
        } else if (offline_buffer_is_enabled()) {
          offline_sample_t off = {
              .voltage_rms = m.voltage_rms,
              .current_rms = m.current_rms,
              .active_power_w = m.active_power_w,
              .apparent_power_va = m.apparent_power_va,
              .power_factor = m.power_factor,
              .frequency_hz = m.frequency_hz,
              .energy_kwh = total_kwh,
              .wifi_rssi = wifi_mgr_get_rssi(),
              .seq = seq,
          };
          sem_mqtt_format_ist_iso8601(off.timestamp_iso,
                                      sizeof(off.timestamp_iso));
          offline_buffer_push(&off);
          led_ind_set_visual_state(LED_DEV_STATE_OFFLINE_BUFFER);
        }
      }
    }
    sem_watchdog_feed();
  }
}

void app_main(void) {
  sem_watchdog_init();
  pstore_init();
  energy_counter_init();
  offline_buffer_init();
  relay_ctrl_init();
  led_ind_init();

  // Load provisioned device & MQTT credentials from NVS if present
  pstore_load_mqtt_creds(s_device_id, sizeof(s_device_id), s_mqtt_user,
                         sizeof(s_mqtt_user), s_mqtt_pass, sizeof(s_mqtt_pass));

  ads131m02_config_t adc_cfg = {
      .spi_host = SPI2_HOST,
      .pin_mosi = PIN_ADC_MOSI,
      .pin_miso = PIN_ADC_MISO,
      .pin_sclk = PIN_ADC_SCLK,
      .pin_cs = PIN_ADC_CS,
      .pin_drdy = PIN_ADC_DRDY,
      .pin_sync_reset = PIN_ADC_RESET,
      .spi_clock_hz = 4000000,
  };
  if (ads131m02_init(&adc_cfg) != ESP_OK) {
    sem_watchdog_log_error("INIT", "ADS131M02 init failed");
    led_ind_set_visual_state(LED_DEV_STATE_FAULT);
  }

  wifi_mgr_init_and_connect();
  ble_prov_start(s_device_id, on_ble_provisioned);

  if (strlen(s_mqtt_user) > 0 && strlen(s_mqtt_pass) > 0) {
    sem_mqtt_config_t mcfg = {
        .broker_uri = DEFAULT_BROKER_URI,
        .ca_cert_pem = strlen(DEFAULT_CA_PEM) > 0 ? DEFAULT_CA_PEM : NULL,
        .device_id = s_device_id,
        .mqtt_user = s_mqtt_user,
        .mqtt_pass = s_mqtt_pass,
        .firmware_version = SEM_FIRMWARE_VERSION,
    };
    sem_mqtt_start(&mcfg);
  }

  // Confirm OTA image valid now that NVS, sensors, relays, and network stack
  // initialized cleanly
  fota_manager_confirm_boot_image();

  ESP_LOGI(TAG,
           "Smart Energy Monitor ESP32-S3 booted (fw=%s, device=%s, "
           "lifetime_kwh=%.4f)",
           SEM_FIRMWARE_VERSION, s_device_id, energy_counter_get_kwh());

  xTaskCreatePinnedToCore(measurement_task, "sem_meas", 8192, NULL, 5, NULL, 1);
}
