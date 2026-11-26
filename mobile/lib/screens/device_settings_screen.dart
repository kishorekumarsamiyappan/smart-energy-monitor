import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../models/models.dart';
import '../providers/app_state.dart';

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
              ('Voltage Sensor', cfg?.voltageSensorModel ?? 'ZMPT101B'),
              ('Current Sensor', cfg?.currentSensorModel ?? 'SCT-013 (30A / 1V built-in burden)'),
              ('ADC', cfg?.adcModel ?? 'ADS131M02 (24-bit simultaneous)'),
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
            onTap: () => _showDetailSheet(context, 'Mode Settings', [
              ('Monitoring Mode', dev.monitoringMode),
              ('Wi-Fi Status', dev.isOnline ? 'Connected (${dev.wifiRssiDbm ?? -55} dBm)' : 'Disconnected'),
              ('Telemetry Interval', '${dev.telemetryIntervalSec} s'),
            ]),
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
        ],
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
                    Text(row.$2, style: const TextStyle(fontWeight: FontWeight.w700, color: SemColors.primary)),
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
                Text('ADC SPI: ${cfg?.adcSpiOk != false ? "SPI OK" : "SPI FAULT"} • DRDY: 4 kSPS • FW ${dev.firmwareVersion}',
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
            Text('GitHub Repo: ${fw?.githubRepo ?? "smart-energy-monitor/esp32s3-firmware"}',
                style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 10),
            if (fw?.latestRelease != null) ...[
              Text('Latest Release: v${fw!.latestRelease!.version} (${fw.latestRelease!.tagName ?? "release"})',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: SemColors.primary)),
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
      leading: Icon(icon, color: SemColors.secondary, size: 28),
      title: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      trailing: const Icon(Icons.chevron_right_rounded, color: SemColors.primary),
      onTap: onTap,
    );
  }
}
