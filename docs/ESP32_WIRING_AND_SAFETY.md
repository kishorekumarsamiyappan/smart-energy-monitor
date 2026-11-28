# ESP32-S3 Hardware Integration, Signal Conditioning & Electrical Safety Guide

> **MANDATORY SAFETY NOTICE:**
> Single-phase mains AC (230 V RMS nominal, ~325 V peak) is lethal. This device is an **advisory monitor only** and is **NOT** a substitute for an MCB, RCCB, circuit breaker, or protective relay. Qualified electrical review and inspection are mandatory prior to mains energization.

## 1. Bill of Materials & Hardware Architecture
- **MCU**: ESP32-S3 DevKit (dual-core Xtensa LX7, hardware SPI + NimBLE + Wi-Fi)
- **ADC**: TI ADS131M02 (24-bit simultaneous 2-channel Sigma-Delta SPI ADC, internal ±1.2 V reference @ Gain=1)
- **Voltage Sensor**: ZMPT101B AC voltage transformer module (isolated potential transformer + op-amp stage)
- **Current Sensor**: SCT-013-000 **100 A / 50 mA** current-output split-core CT (**NO built-in burden resistor** — requires an **external 22 Ω precision burden resistor** + mid-rail bias network)

## 2. Signal Conditioning Requirements (ESP32-S3 12-bit ADC1)
1. **Never connect raw unconditioned AC waveforms to an ESP32 GPIO pin.**
2. **ESP32-S3 ADC1 Input Limits (`ADC_ATTEN_DB_12`)**: Keep all ADC pin voltages strictly inside `[0 V, 3.3 V]` (centered at mid-rail bias `1.65 V`).
3. **ZMPT101B Conditioning (GPIO 4 / `ADC1_CH3`)**:
   - Verify your specific ZMPT101B module's output swing is centered at `VCC/2` (`~1.65 V`) cleanly inside `0–3.3 V`, calibrated against a True-RMS multimeter (`VOLTAGE_CAL = 311.5`).
4. **SCT-013-000 100A / 50mA Conditioning (GPIO 5 / `ADC1_CH4`)**:
   - The `100 A / 50 mA` model (2000:1 turns ratio) outputs secondary current proportional to line current (`50 mArms` at `100 Arms`).
   - Connect an external **22 Ω precision burden resistor** across the CT jack terminals (`0–50 mArms × 22 Ω = 0–1.1 Vrms`, or `±1.55 Vpeak` max), AC-coupled / biased at `1.65 V` (`10 kΩ / 10 kΩ` divider + `10 µF` bypass capacitor) into GPIO 5 (`CALIBRATION = 23.202` bench-calibrated with clamp meter).
   - **CRITICAL**: Because `SCT-013-000` is a **current-output CT** (without an internal burden resistor), **never energize the monitored circuit while the CT jack is unplugged or without the 22 Ω burden resistor connected**, as hazardous secondary voltage spikes can develop.

## 3. Isolation, Creepage, Clearance & Protection
- Maintain **≥ 6.4 mm creepage and ≥ 4.0 mm clearance** (IEC 62368-1 / IEC 61010-1 reinforced/basic spacing for 230 Vrms CAT II/III) between primary HV traces and secondary LV circuitry, with milled isolation slots under the ZMPT101B transformer and AC-DC PSU.
- Install a **high-rupturing-capacity (HRC) ceramic fuse (e.g. 500 mA – 1 A, 250 V AC)** and **MOV surge arrestor (275 Vrms / 300 Vrms)** on the Line feed to the voltage sense & power supply.
- Enclose the completed assembly in a flame-retardant UL94-V0 insulated enclosure before panel mounting.

## 4. Default ESP32-S3 ↔ ADS131M02 Pinout (`firmware/main/main.c`)
| Signal | ESP32-S3 GPIO | Notes |
|---|---|---|
| `MOSI` | GPIO 11 | SPI2 Master Out |
| `MISO` | GPIO 13 | SPI2 Master In |
| `SCLK` | GPIO 12 | SPI2 Clock (4 MHz) |
| `CS`   | GPIO 10 | Active-Low Chip Select |
| `DRDY` | GPIO 9  | Falling-edge Data Ready ISR |
| `SYNC/RESET` | GPIO 14 | Active-Low Hardware Reset |
| `Relay CH1` (Confirmed) | GPIO 4 | Opto-isolated relay / SSR / contactor driver (never replaces MCB/RCCB) |
| `Relays CH2–CH8` (Optional) | GPIO 5, 6, 7, 15, 16, 17, 18, 38–42 | User-expandable non-reserved GPIOs for offline RTC scheduled loads |
| `Consumption Pulse LED` | GPIO 21 | External LED blinking proportionally to active energy (`1600 imp/kWh` default) |
| `Inbuilt Status RGB LED` | GPIO 48 | WS2812 addressable RGB status indicator (RMT mode) |
| `Single Status LED` | GPIO 2 | Optional external single-color status LED (selectable in Device Settings) |

## 5. Offline Persistence, LED Codes & GitHub FOTA Partitioning
- **SPIFFS Offline Buffer (`offline_log`, `0xCF000` bytes)**: Stores NDJSON telemetry snapshots when Wi-Fi/MQTT is unavailable and drains oldest-first (`"buffered": true`) upon reconnect without disturbing monotonic kWh counters.
- **Offline RTC Relay Schedules**: All relay channels and IST schedules mirror into ESP32 NVS (`sem_relays`), continuing minute-accurate switching offline as long as RTC wall time is retained.
- **Dual OTA Partitions (`ota_0` / `ota_1`)**: Supports HTTPS GitHub Releases FOTA with `esp_crt_bundle_attach`, NVS kWh flush prior to reboot, and automatic bootloader rollback verification (`fota_manager_confirm_boot_image`).
