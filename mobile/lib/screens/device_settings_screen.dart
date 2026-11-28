import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/ble_provisioning_service.dart';

class DeviceSettingsScreen extends StatelessWidget {
  final String deviceId;

  const DeviceSettingsScreen({super.key, required this.deviceId});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.devices.firstWhere(
      (d) => d.deviceId == deviceId,
      orElse: () => state.devices.first,
    );
    final cfg = state.sensorConfigByDevice[dev.deviceId];
    final ioCfg = state.ioConfigByDevice[dev.deviceId];
    final fw = state.firmwareByDevice[dev.deviceId];
    final latest = state.latestByDevice[dev.deviceId];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Device Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text('${dev.name} / ${dev.deviceId}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
          ],
        ),
      ),
      body: ListView(
        children: [
          _SettingsMenuRow(
            icon: Icons.memory_rounded,
            title: 'Sensor Settings',
            onTap: () => _showDetailSheet(context, 'Sensor Settings', [
              ('Voltage Sensor', cfg?.voltageSensorModel ?? 'ZMPT101B (GPIO 4)'),
              ('Current Sensor', cfg?.currentSensorModel ?? 'SCT-013-000 + 22Ω (GPIO 5)'),
              ('ADC', cfg?.adcModel ?? 'ESP32-S3 12-bit ADC1 @ 5 kSPS'),
            ]),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.tune_rounded,
            title: 'Sensor Configuration',
            onTap: () => _showDetailSheet(context, 'Sensor Configuration', [
              ('Voltage Cal Factor', '${cfg?.voltageCalibrationFactor ?? 1.0}'),
              ('Current Cal Factor', '${cfg?.currentCalibrationFactor ?? 1.0}'),
              ('Phase Correction', '${cfg?.phaseCorrectionDeg ?? 0.0} deg'),
              ('Nominal Frequency', '${cfg?.nominalFrequencyHz ?? 50.0} Hz'),
              ('Calibration Date', cfg?.calibrationDate ?? 'Factory baseline'),
              ('Calibration Status', cfg?.calibrationStatus ?? 'verified'),
            ]),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.cable_rounded,
            title: 'I/O Configuration',
            onTap: () => _showIoConfigSheet(context, state, dev.deviceId, cfg, ioCfg, dev),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.speed_rounded,
            title: 'Mode Settings',
            onTap: () => _showModeSheet(context, state, dev),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.system_update_alt_rounded,
            title: 'Firmware & GitHub FOTA',
            onTap: () => _showFotaSheet(context, state, dev.deviceId, dev, fw),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.summarize_outlined,
            title: 'Summary',
            onTap: () => _showDetailSheet(context, 'Summary', [
              ('Device Status', dev.isOnline ? 'Online' : 'Offline'),
              ('Total Lifetime Energy', latest != null ? '${latest.energyKwh.toStringAsFixed(3)} kWh' : '--'),
              ('Last Update', IstTimeUtils.formatDateTimeIst(latest?.ingestedAt ?? dev.lastSeenAt)),
              ('Sensor Health', (cfg?.sensorHealthStatus ?? 'good').toUpperCase()),
              ('Calibration Status', cfg?.calibrationStatus ?? 'verified'),
            ]),
          ),
          const Divider(height: 1),
          _SettingsMenuRow(
            icon: Icons.restart_alt_rounded,
            title: 'Factory Reset & Remove Device',
            onTap: () => _confirmFactoryReset(context, state, dev.deviceId, dev.name),
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }

  Future<void> _confirmFactoryReset(
    BuildContext context,
    AppState state,
    String deviceId,
    String name,
  ) async {
    bool wipeBle = false;
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: const Text('Factory Reset & Remove Device'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Remove $name ($deviceId) from your SEM account so it can be paired fresh?'),
              if (!state.isDemoMode) ...[
                const SizedBox(height: 10),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: wipeBle,
                  onChanged: busy ? null : (v) => setDlgState(() => wipeBle = v ?? false),
                  title: const Text(
                    'Also wipe ESP32-S3 NVS over BLE',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  subtitle: const Text(
                    'Or hold BOOT for 5s on the ESP32-S3 to clear saved Wi-Fi/MQTT credentials.',
                    style: TextStyle(fontSize: 11.5),
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: SemColors.error),
              onPressed: busy
                  ? null
                  : () async {
                      setDlgState(() => busy = true);
                      if (wipeBle && !state.isDemoMode) {
                        try {
                          await BleProvisioningService().factoryResetDeviceById(deviceId);
                        } catch (_) {}
                      }
                      await state.removeDevice(deviceId);
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (context.mounted) Navigator.pop(context);
                    },
              child: Text(busy ? 'Removing...' : 'Factory Reset & Remove'),
            ),
          ],
        ),
      ),
    );
  }

  void _showModeSheet(BuildContext context, AppState state, DeviceModel dev) {
    var intervalSec = dev.telemetryIntervalSec;
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Mode & Interval Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Monitoring Mode', style: TextStyle(fontWeight: FontWeight.w600)),
                  Text(dev.monitoringMode, style: TextStyle(fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Power-Cut Detection', style: TextStyle(fontWeight: FontWeight.w600)),
                  Text('20s Keepalive (~30s LWT)', style: TextStyle(fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context))),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Stale Data Threshold', style: TextStyle(fontWeight: FontWeight.w600)),
                  Text('45 s', style: TextStyle(fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context))),
                ],
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<int>(
                initialValue: const [5, 10, 15, 30, 60].contains(intervalSec) ? intervalSec : 10,
                decoration: const InputDecoration(labelText: 'Telemetry Publish Interval'),
                items: const [
                  DropdownMenuItem(value: 5, child: Text('Every 5s (Ultra Fast)')),
                  DropdownMenuItem(value: 10, child: Text('Every 10s (Recommended)')),
                  DropdownMenuItem(value: 15, child: Text('Every 15s (Balanced)')),
                  DropdownMenuItem(value: 30, child: Text('Every 30s (Low Data)')),
                  DropdownMenuItem(value: 60, child: Text('Every 60s (Economy)')),
                ],
                onChanged: (v) {
                  if (v != null) setSheetState(() => intervalSec = v);
                },
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    await state.updateTelemetryInterval(dev.deviceId, intervalSec);
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Telemetry interval set to ${intervalSec}s and pushed to ESP32-S3.')),
                      );
                    }
                  },
                  child: const Text('Save Interval'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetailSheet(BuildContext context, String title, List<(String, String)> rows) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            for (final row in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(row.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(row.$2, style: TextStyle(fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context))),
                  ],
                ),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  void _showIoConfigSheet(
    BuildContext context,
    AppState state,
    String deviceId,
    DeviceSensorConfigModel? cfg,
    DeviceIoConfigModel? ioCfg,
    DeviceModel dev,
  ) {
    var ledMode = ioCfg?.statusLedMode ?? 'inbuilt_rgb';
    var pulseEnabled = ioCfg?.pulseLedEnabled ?? true;
    var offlineBuf = ioCfg?.offlineBufferEnabled ?? true;
    final rgbCtrl = TextEditingController(text: '${ioCfg?.statusRgbGpio ?? 48}');
    final singleCtrl = TextEditingController(text: '${ioCfg?.statusSingleLedGpio ?? 2}');
    final pulseCtrl = TextEditingController(text: '${ioCfg?.pulseLedGpio ?? 21}');
    final impCtrl = TextEditingController(text: '${ioCfg?.pulseImpPerKwh ?? 1600}');

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('I/O & LED Configuration', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Text('ADC1: ${cfg?.adcSpiOk != false ? "GPIO 4 & 5 OK" : "ADC FAULT"} • 5 kSPS RMS • FW ${dev.firmwareVersion}',
                    style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: ledMode,
                  decoration: const InputDecoration(labelText: 'Device Status LED Mode'),
                  items: const [
                    DropdownMenuItem(value: 'inbuilt_rgb', child: Text('Inbuilt RGB LED (WS2812)')),
                    DropdownMenuItem(value: 'single_gpio', child: Text('Single Monochrome GPIO LED')),
                    DropdownMenuItem(value: 'disabled', child: Text('Disabled')),
                  ],
                  onChanged: (v) {
                    if (v != null) setSheetState(() => ledMode = v);
                  },
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: rgbCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'RGB GPIO'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: singleCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Single LED GPIO'),
                      ),
                    ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('External Consumption Pulse LED'),
                  value: pulseEnabled,
                  onChanged: (v) => setSheetState(() => pulseEnabled = v),
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: pulseCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Pulse GPIO'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: impCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'imp / kWh'),
                      ),
                    ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Offline Flash Buffer (${ioCfg?.offlineBufferedCount ?? 0} queued)'),
                  value: offlineBuf,
                  onChanged: (v) => setSheetState(() => offlineBuf = v),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      await state.updateIoConfig(
                        deviceId,
                        statusLedMode: ledMode,
                        statusRgbGpio: int.tryParse(rgbCtrl.text.trim()) ?? 48,
                        statusSingleLedGpio: int.tryParse(singleCtrl.text.trim()) ?? 2,
                        pulseLedEnabled: pulseEnabled,
                        pulseLedGpio: int.tryParse(pulseCtrl.text.trim()) ?? 21,
                        pulseImpPerKwh: int.tryParse(impCtrl.text.trim()) ?? 1600,
                        offlineBufferEnabled: offlineBuf,
                      );
                      if (ctx.mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('I/O & LED settings saved.')),
                        );
                      }
                    },
                    child: const Text('Save I/O & LED Config'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showFotaSheet(
    BuildContext context,
    AppState state,
    String deviceId,
    DeviceModel dev,
    DeviceFirmwareStatusModel? fw,
  ) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Firmware & GitHub FOTA', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Text('Installed Version: v${fw?.currentVersion ?? dev.firmwareVersion}',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('GitHub Repo: ${fw?.githubRepo ?? "kishorekumarsamiyappan/smart-energy-monitor"}',
                style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 10),
            if (fw?.latestRelease != null) ...[
              Text('Latest Release: v${fw!.latestRelease!.version} (${fw.latestRelease!.tagName ?? "release"})',
                  style: TextStyle(fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context))),
              const SizedBox(height: 4),
              Text(fw.latestRelease!.releaseNotes, style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.system_update_alt_rounded),
                  label: Text(
                    fw.updateAvailable
                        ? 'Install / Update Firmware (v${fw.latestRelease!.version})'
                        : 'Firmware Up To Date (v${fw.currentVersion})',
                  ),
                  onPressed: fw.updateAvailable
                      ? () async {
                          await state.triggerFirmwareOta(deviceId);
                          if (ctx.mounted) {
                            Navigator.pop(ctx);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('FOTA update to v${fw.latestRelease!.version} triggered.')),
                            );
                          }
                        }
                      : null,
                ),
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _SettingsMenuRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _SettingsMenuRow({required this.icon, required this.title, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      leading: Icon(icon, color: SemColors.accentSecondary(context), size: 28),
      title: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      trailing: Icon(Icons.chevron_right_rounded, color: SemColors.accentPrimary(context)),
      onTap: onTap,
    );
  }
}
