# SEM ESP32-S3 Firmware Over-the-Air (GitHub FOTA) — Complete A-to-Z Guide

This guide explains end-to-end how to modify, compile, release on GitHub, sync into the SEM cloud backend, and remotely flash your **ESP32-S3** meter (`SEM_ESP32S3_01`) via HTTPS FOTA—with automatic power-loss energy preservation and rollback safety.

---

## Architecture Overview

```text
[1. Bump Version & Edit C Code]
        │
        ▼
[2. Compile with ESP-IDF v5.4.5 (`idf.py build`)]
        │  └── outputs: firmware/build/smart_energy_monitor_esp32s3.bin (~1.3 MB < 1.5 MB OTA slot)
        ▼
[3. Publish GitHub Release (`v1.3.2`) + Attach `.bin` Asset]
        │  └── repo: https://github.com/kishorekumarsamiyappan/smart-energy-monitor/releases
        ▼
[4. Sync Release in SEM Web `/admin` (`POST /api/admin/firmware/sync-github`)]
        │  └── Cloudflare Worker stores binary download URL + tag in Supabase
        ▼
[5. Click "Install / Update Firmware" in Web or SEM Mobile App]
        │  └── POST /api/devices/:id/ota -> EMQX QoS 1 publish to `energy/<device_id>/command`
        ▼
[6. ESP32-S3 Downloads Over TLS (`fota_manager_start`)]
        ├── Reports progress on `energy/<device_id>/status` (10% -> 95% -> 100%)
        ├── Flushes `energy_counter_flush_now()` to NVS so total kWh is never lost
        └── Reboots into `ota_0`/`ota_1`; calls `fota_manager_confirm_boot_image()` on healthy boot
```

---

## A. Partition Layout & Bootloader Safety (`partitions.csv` & `sdkconfig.defaults`)

Your 4 MB flash (`firmware/partitions.csv`) already reserves two 1.5 MB (`0x180000`) OTA slots:

| Partition | Subtype | Offset | Size | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `nvs` | `nvs` | `0x9000` | `32 KB` | Wi-Fi creds, MQTT creds, device ID, calibration, kWh, relays |
| `otadata` | `ota` | `0x11000` | `8 KB` | Tracks active slot (`ota_0` vs `ota_1`) + rollback pending bit |
| `ota_0` | `ota_0` | `0x20000` | `1.5 MB` | Application slot A |
| `ota_1` | `ota_1` | `0x1a0000` | `1.5 MB` | Application slot B |
| `offline_log` | `spiffs` | `0x321000` | `828 KB` | Offline telemetry ring buffer during Wi-Fi/MQTT outages |

Rollback & HTTPS TLS settings (`firmware/sdkconfig.defaults`):
- `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y` — if a bad update crashes before `fota_manager_confirm_boot_image()`, the bootloader automatically rolls back to the previous working image on reset.
- `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE=y` — validates GitHub Releases & CDN (`objects.githubusercontent.com`) TLS certificates.
- `CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP=n` — strictly requires `https://` URLs (`fota_manager.c` rejects non-HTTPS URLs).

---

## B. Step-by-Step: Make Changes & Bump Firmware Version

1. Open [firmware/main/main.c](file:///c:/Users/k9003/Desktop/Smart%20Energy%20Monitor/firmware/main/main.c) and bump `SEM_FIRMWARE_VERSION`:
   ```c
   #define SEM_FIRMWARE_VERSION "1.3.2"
   ```
2. Also match `s_fw_ver` fallback in [firmware/mqtt_client/mqtt_client_app.c](file:///c:/Users/k9003/Desktop/Smart%20Energy%20Monitor/firmware/mqtt_client/mqtt_client_app.c):
   ```c
   static char s_fw_ver[32] = "1.3.2";
   ```
   *(Never use a version identical to the currently flashed version, or the dashboard will show "UP TO DATE".)*

---

## C. Step-by-Step: Compile the `.bin` Binary Locally (Windows PowerShell)

1. Open PowerShell and activate ESP-IDF v5.4.5:
   ```powershell
   cd "c:\Users\k9003\Desktop\Smart Energy Monitor\firmware"
   . "C:\esp\esp-idf\export.ps1"
   ```
2. Only on a brand-new clone, set target once (`idf.py set-target esp32s3` — **warning:** running `set-target` deletes your `sdkconfig` and resets defaults; skip it once already set!).
3. Build the firmware binary:
   ```powershell
   idf.py build
   ```
4. Verify size & output path:
   - Compiled file: **`firmware/build/smart_energy_monitor_esp32s3.bin`**
   - Check output line at the end of `idf.py build`:
     `smart_energy_monitor_esp32s3.bin binary size ... Smallest app partition is 0x180000 bytes.`
   - Ensure binary size stays strictly under **`0x180000` bytes (`1,572,864` bytes)**.

*(Optional USB flash test on a bench board before releasing: `idf.py -p COM4 flash monitor`)*

---

## D. Step-by-Step: Create the GitHub Release

1. Push your updated firmware source code to GitHub:
   ```powershell
   cd "c:\Users\k9003\Desktop\Smart Energy Monitor"
   git add -A
   git commit -m "chore(firmware): release v1.3.2"
   git push origin main
   ```
2. Open **GitHub → `kishorekumarsamiyappan/smart-energy-monitor` → Releases → Draft a new release**:
   - **Choose a tag:** type `v1.3.2` (must start with `v` + match your new version) → click **Create new tag on publish**.
   - **Release title:** `SEM Firmware v1.3.2`
   - **Release notes:** summarize changes (e.g., `10s interval + 20s MQTT keepalive + brownout-safe SPIFFS offline spool`).
   - **Attach binaries:** drag and drop **`firmware/build/smart_energy_monitor_esp32s3.bin`** into the release assets box.
     > **Critical:** The Cloudflare Worker's `/api/admin/firmware/sync-github` specifically looks for an asset whose filename ends with **`.bin`**. Do not upload only `.zip` or `.elf`.
   - Keep **Pre-release** unchecked so `/releases/latest` returns it, then click **Publish release**.

*(Tip: Notice your GitHub repo should be **public** unless you configure `npx wrangler secret put GITHUB_TOKEN` on `workers/api` with `repo:read` permissions so Cloudflare Worker can fetch private releases.)*

---

## E. Sync the Release into SEM Cloud (Web `/admin`)

1. Sign in to the SEM Web app using an **admin** account (`users.role = 'admin'` in Supabase).
2. Navigate to **`/admin`** → find **GitHub Firmware Releases**.
3. Ensure repo box reads: `kishorekumarsamiyappan/smart-energy-monitor` (default configured in `workers/api/wrangler.toml` `GITHUB_FIRMWARE_REPO`).
4. Click **"Sync Latest Release from GitHub"**.
   - What happens behind the scenes:
     - Worker fetches `https://api.github.com/repos/kishorekumarsamiyappan/smart-energy-monitor/releases/latest`.
     - Extracts `tag_name` (`v1.3.2` → version `1.3.2`) and the `.bin` asset's `browser_download_url`.
     - Saves it into `firmware_releases` in Supabase.
5. *(Alternative Manual Registration)* If hosting a `.bin` elsewhere over HTTPS, enter Version (`1.3.2`), the direct HTTPS `.bin` URL, and notes in **Publish FOTA Binary Release**.

---

## F. Flash Remotely via FOTA (Web or SEM Mobile App)

1. Make sure the ESP32-S3 is **online** (Wi-Fi + EMQX TLS connected).
2. Open **Devices → `SEM_ESP32S3_01` → Settings → Firmware & GitHub FOTA** (Web or Android app).
3. You will see:
   - **Installed:** `v1.3.1`
   - **Badge:** `UPDATE AVAILABLE` → **Latest Release:** `v1.3.2`
4. Click **"Install / Update Firmware (v1.3.2)"**.
5. Live execution sequence on the ESP32-S3:
   - Cloud publishes JSON to MQTT topic `energy/SEM_ESP32S3_01/command`:
     ```json
     {"command":"ota_update","job_id":"...","version":"1.3.2","url":"https://github.com/.../smart_energy_monitor_esp32s3.bin"}
     ```
   - `fota_manager_start()` spawns `sem_fota` task, sets Status LED to FOTA state, and streams the binary over HTTPS (`esp_https_ota`, following GitHub → `objects.githubusercontent.com` redirects).
   - ESP32 publishes status updates on `energy/SEM_ESP32S3_01/status` (`downloading` 10%→90% → `flashing` 95% → `succeeded` 100%).
   - `energy_counter_flush_now()` saves total kWh into NVS, then the ESP32 reboots into the new OTA partition.
   - Once Wi-Fi/MQTT connects cleanly after reboot, `app_main()` calls `fota_manager_confirm_boot_image()` to permanently commit the new partition.

---

## G. Troubleshooting FOTA Issues

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| `Sync Latest Release` fails (`MISSING_BIN_ASSET`) | Release had no `.bin` attachment or was marked Prerelease/Draft. | Edit GitHub release, attach `smart_energy_monitor_esp32s3.bin`, ensure published as latest non-prerelease. |
| `Sync Latest Release` returns HTTP `404` | Repository is private and `GITHUB_TOKEN` isn't set on Worker. | Make repo public or run `npx wrangler secret put GITHUB_TOKEN` inside `workers/api/`. |
| Status turns `failed` immediately (`0%`) | Binary URL isn't HTTPS, or ESP32 RAM/DNS/Wi-Fi dropped. | Verify `https://.../*.bin` URL opens in a browser and Wi-Fi RSSI > `-80 dBm`. |
| Board reboots back to old version | New firmware crashed/reset before `fota_manager_confirm_boot_image()`. | Bootloader rollback worked! Connect USB `idf.py monitor` to inspect the crash before pushing fixed binary. |
| `binary size exceeds partition` on build | App exceeded `0x180000` (`1.5 MB`). | Keep release optimization (`-O3`/`-Os`) or trim unused components before building. |
