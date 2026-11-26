# ESP32-S3 Hardware Integration, Signal Conditioning & Electrical Safety Guide

> **MANDATORY SAFETY NOTICE:**
> Single-phase mains AC (230 V RMS nominal, ~325 V peak) is lethal. This device is an **advisory monitor only** and is **NOT** a substitute for an MCB, RCCB, circuit breaker, or protective relay. Qualified electrical review and inspection are mandatory prior to mains energization.

## 1. Bill of Materials & Hardware Architecture
- **MCU**: ESP32-S3 DevKit (dual-core Xtensa LX7, hardware SPI + NimBLE + Wi-Fi)
- **ADC**: TI ADS131M02 (24-bit simultaneous 2-channel Sigma-Delta SPI ADC, internal ±1.2 V reference @ Gain=1)
- **Voltage Sensor**: ZMPT101B AC voltage transformer module (isolated potential transformer + op-amp stage)
- **Current Sensor**: SCT-013 **30 A / 1 V** voltage-output split-core CT (**has a built-in internal burden resistor** — **DO NOT** add an external burden resistor!)
- **Isolated Power Supply**: Certified reinforced-isolation 230 V AC → 5 V DC medical/industrial module (≥ 3 kVrms isolation) + low-noise LDO 3.3 V for ADS131M02 analog/digital rails (`AVDD` / `DVDD`).

## 2. Signal Conditioning Requirements (ADS131M02)
1. **Never connect raw unconditioned AC waveforms to an ESP32 GPIO or ADS131M02 input pin.**
2. **ADS131M02 Input Limits (Gain = 1)**: Differential input range `±1.2 V` (`V_AINxP - V_AINxN`). Absolute pin voltage must stay inside `[AGND - 0.3 V, AVDD + 0.3 V]`.
3. **ZMPT101B Conditioning (Channel 0)**:
   - Verify your specific ZMPT101B module's output swing at 265 Vrms overvoltage margin (many modules output centered at `VCC/2` with up to ±1.5 V–2.0 V peak).
   - AC-couple via non-polarized capacitor (e.g., 10 µF), bias common-mode at `AVDD / 2` (1.65 V) into `AIN0N`, and attenuate `AIN0P` with precision 0.1% resistors + anti-aliasing RC filter (e.g., `fc ≈ 1.5 kHz`) + bidirectional Schottky/TVS clamp so differential voltage never exceeds `±1.0 Vpeak` at 275 Vrms mains.
4. **SCT-013 30A / 1V Conditioning (Channel 1)**:
   - At 30 Arms rated current, the built-in burden produces `1.0 Vrms` = `1.414 Vpeak`.
   - Note that `1.414 Vpeak` exceeds the ADS131M02 `±1.2 V` Gain=1 full-scale range!
   - Use a precision **0.5× resistive divider** (`10 kΩ` / `10 kΩ`, 0.1%) referenced to mid-rail bias (`AVDD/2`) + `100 nF` anti-aliasing filter + TVS clamp so 30 Arms maps cleanly to `±0.707 Vpeak` (leaving comfortable crest-factor headroom up to ~50 A peaks without clipping!).
   - **CRITICAL**: Because the 30A/1V model already contains an internal burden resistor, adding another low-value burden resistor across the jack will halve/distort sensitivity and overheat the CT.

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
