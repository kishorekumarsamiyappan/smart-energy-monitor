import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../providers/app_state.dart';
import '../services/ble_provisioning_service.dart';
import '../widgets/sem_widgets.dart';
import 'device_settings_screen.dart';
import 'monitoring_screen.dart';
import 'relays_screen.dart';

class DevicesScreen extends StatelessWidget {
  final VoidCallback onAddDevice;

  const DevicesScreen({super.key, required this.onAddDevice});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 88),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Paired Devices', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            ElevatedButton.icon(
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add'),
              onPressed: onAddDevice,
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (final dev in state.devices) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          '${dev.name} (${dev.deviceId})',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                      ),
                      SemStatusBadge(
                        label: dev.isOnline ? 'Online' : 'Offline',
                        color: dev.isOnline ? SemColors.success : SemColors.error,
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Last seen: ${IstTimeUtils.formatTimeIst(dev.lastSeenAt)} • FW ${dev.firmwareVersion}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  if (state.latestByDevice[dev.deviceId] != null) ...[
                    Builder(builder: (_) {
                      final l = state.latestByDevice[dev.deviceId]!;
                      return Text(
                        '${l.voltageRms.toStringAsFixed(1)} V  |  ${l.currentRms.toStringAsFixed(2)} A  |  ${l.activePowerW.toStringAsFixed(0)} W  |  ${l.energyKwh.toStringAsFixed(2)} kWh',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: SemColors.accentPrimary(context)),
                      );
                    }),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ElevatedButton(
                        onPressed: () {
                          state.selectDevice(dev.deviceId);
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const MonitoringScreen()),
                          );
                        },
                        child: const Text('Open'),
                      ),
                      OutlinedButton(
                        onPressed: () => _showRenameDialog(context, state, dev.deviceId, dev.name),
                        child: const Text('Rename'),
                      ),
                      OutlinedButton(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => RelaysScreen(deviceId: dev.deviceId)),
                          );
                        },
                        child: const Text('Relays'),
                      ),
                      OutlinedButton(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => DeviceSettingsScreen(deviceId: dev.deviceId)),
                          );
                        },
                        child: const Text('Settings'),
                      ),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(foregroundColor: SemColors.error),
                        onPressed: () => _confirmRemove(context, state, dev.deviceId, dev.name),
                        child: const Text('Remove'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Future<void> _showRenameDialog(
    BuildContext context,
    AppState state,
    String deviceId,
    String currentName,
  ) async {
    final ctrl = TextEditingController(text: currentName);
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename Device'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'Device Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              if (ctrl.text.trim().length >= 2) {
                await state.renameDevice(deviceId, ctrl.text.trim());
                if (ctx.mounted) Navigator.pop(ctx);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmRemove(
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
              Text(
                'Remove $name ($deviceId) from your SEM account so it can be paired fresh?',
              ),
              const SizedBox(height: 10),
              if (!state.isDemoMode)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: wipeBle,
                  onChanged: busy ? null : (v) => setDlgState(() => wipeBle = v ?? false),
                  title: const Text(
                    'Also wipe ESP32-S3 NVS over BLE',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  subtitle: const Text(
                    'If board is not nearby in BLE setup mode, hold BOOT on the ESP32-S3 for 5s instead.',
                    style: TextStyle(fontSize: 11.5),
                  ),
                ),
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
                      String? bleNote;
                      if (wipeBle && !state.isDemoMode) {
                        try {
                          final wiped = await BleProvisioningService().factoryResetDeviceById(deviceId);
                          bleNote = wiped
                              ? 'ESP32-S3 NVS wiped over BLE.'
                              : 'ESP32-S3 not advertising over BLE; removed from cloud account.';
                        } catch (e) {
                          bleNote = 'BLE wipe skipped ($e); removed from cloud account.';
                        }
                      }
                      await state.removeDevice(deviceId);
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (context.mounted && bleNote != null) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(bleNote)));
                      }
                    },
              child: Text(busy ? 'Removing...' : 'Factory Reset & Remove'),
            ),
          ],
        ),
      ),
    );
  }
}
