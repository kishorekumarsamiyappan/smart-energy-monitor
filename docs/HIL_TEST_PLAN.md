# Hardware-in-the-Loop (HIL) Sensor & Firmware Test Plan

> **Important**: Run all high-voltage bench tests behind an isolation transformer and RCD/GFCI with calibrated reference instrumentation (e.g., Fluke 43B / Hioki PW3337 / Class 0.5 reference wattmeter).

## 1. Pre-Power & Low-Voltage ADC Verification
1. Verify 3.3 V `AVDD`/`DVDD` rails and 1.65 V bias mid-rail before attaching mains.
2. Flash firmware (`idf.py build flash monitor`) and confirm ADS131M02 `STATUS` register ≠ `0x0000`/`0xFFFF` and `DRDY` interrupts fire consistently at 4 kSPS.
3. Short `AIN0P-AIN0N` and `AIN1P-AIN1N` to mid-rail bias: confirm `Vrms ≈ 0 V`, `Irms < 0.03 A` noise-floor gated to `0.0 A`, `P = 0.0 W`.

## 2. Linear & Phase Calibration (Isolated Variac + Reference Load)
1. **Voltage Calibration (`ZMPT101B`)**: Step isolated AC source at 180 V, 210 V, 230 V, 250 V against True-RMS reference voltmeter. Adjust `voltageCalibrationFactor` until error `< ±0.5%`.
2. **Current Calibration (`SCT-013 30A/1V`)**: Clamp SCT-013 around a single conductor (never twin-core cable!) feeding purely resistive load steps (1 A, 5 A, 10 A, 20 A, 28 A). Adjust `currentCalibrationFactor` until error `< ±1.0%`.
3. **Phase Correction & Power Factor**: Feed resistive load (`PF ≈ 1.00`) and inductive/motor load (`PF ≈ 0.65–0.85`). Tune `phaseCorrectionDeg` until active power `P` matches reference wattmeter within `±1.5%` across both unity and lagging PF.
4. **Frequency Accuracy**: Compare reported `frequency_hz` against reference counter across 49.0 Hz – 51.0 Hz (`±0.05 Hz` tolerance).

## 3. Reliability, Persistence & MQTT Fault Injection
1. **NVS Lifetime kWh Persistence**: Accumulate ≥ 0.05 kWh, issue `flush_energy` command or disconnect 5 V power abruptly; reboot and verify `energy_kwh` restores monotonically without resetting.
2. **Wi-Fi / EMQX Disconnect & Offline SPIFFS Spool**: Disable AP for 3 minutes under load, verify Status LED shifts to Amber (`inbuilt_rgb`) or Double-Blink (`single_gpio`), records spool to `/offline/spool.ndjson`, reconnects and backfills `"buffered": true` packets to cloud DB without triggering false counter resets.
3. **Offline Relay CH1–CH2 Scheduling**: Configure an IST schedule 2 minutes ahead, disconnect Wi-Fi completely, wait past `start_time_ist` and `stop_time_ist` on ESP32 RTC, and confirm relay GPIOs toggle autonomously offline.
4. **Consumption Pulse LED Verification**: Apply calibrated 1000 W load with `1600 imp/kWh`; confirm external GPIO 21 LED blinks ~1 pulse every 2.25 seconds (`1000 W * 2.25s = 0.625 Wh = 1/1600 kWh`).
5. **GitHub Releases HTTPS FOTA & Rollback**: Publish a signed `.bin` release on GitHub, click **Install / Update Firmware** in Web/Mobile, observe OTA progress on `/status` -> reboot into new `ota_1` partition -> confirm NVS lifetime kWh preserved -> verify bootloader marks image valid (`esp_ota_mark_app_valid_cancel_rollback`).
6. **Watchdog Recovery**: Simulate SPI timeout (unplug ADC ribbon on low-voltage bench); confirm `sensor_failure` MQTT alert fires cleanly and TWDT protects against lockup.
