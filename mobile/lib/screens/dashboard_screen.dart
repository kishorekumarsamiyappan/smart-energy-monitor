import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/constants/app_constants.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../providers/app_state.dart';
import '../widgets/sem_widgets.dart';
import 'device_settings_screen.dart';
import 'monitoring_screen.dart';
import 'relays_screen.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback onOpenMonitoring;
  final VoidCallback onOpenBilling;

  const DashboardScreen({
    super.key,
    required this.onOpenMonitoring,
    required this.onOpenBilling,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final query = _search.trim().toLowerCase();
    final filtered = query.isEmpty
        ? state.devices
        : state.devices
            .where((d) =>
                d.name.toLowerCase().contains(query) ||
                d.deviceId.toLowerCase().contains(query))
            .toList();

    return RefreshIndicator(
      onRefresh: state.refreshProductionData,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 88),
        children: [
          // Search Bar matching AVR home screen
          TextField(
            decoration: InputDecoration(
              hintText: 'Search devices...',
              prefixIcon: Icon(Icons.search_rounded, color: SemColors.accentPrimary(context)),
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
          const SizedBox(height: 14),
          if (filtered.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(Icons.sensors_off, size: 40, color: SemColors.accentSecondary(context)),
                    SizedBox(height: 10),
                    Text('No Energy Devices Found', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    SizedBox(height: 6),
                    Text(
                      'Tap the + button to pair an ESP32-S3 monitor via BLE or manual device ID.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          else
            for (final dev in filtered) ...[
              _buildDeviceDashboardCard(context, state, dev.deviceId),
              const SizedBox(height: 14),
            ],
        ],
      ),
    );
  }

  Widget _buildDeviceDashboardCard(BuildContext context, AppState state, String deviceId) {
    final dev = state.devices.firstWhere((d) => d.deviceId == deviceId);
    final latest = state.latestByDevice[deviceId];
    final lastTs = DateTime.tryParse(latest?.ingestedAt ?? dev.lastSeenAt ?? '');
    final hasAnyPacket = latest != null || lastTs != null;
    final stale = lastTs == null ||
        DateTime.now().toUtc().difference(lastTs.toUtc()).inSeconds > AppConstants.staleTelemetrySeconds;
    final online = dev.isOnline && !stale;
    final bill = state.currentBillingEstimateFor(deviceId);
    final relays = state.relaysByDevice[deviceId] ?? [];
    final primaryRelay = relays.isNotEmpty ? relays.first : null;
    final fw = state.firmwareByDevice[deviceId];
    final ioCfg = state.ioConfigByDevice[deviceId];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${dev.name} (${dev.deviceId})',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        hasAnyPacket
                            ? '${IstTimeUtils.formatTimeIst(latest?.ingestedAt ?? dev.lastSeenAt)}${stale ? " • STALE" : ""}'
                            : 'Awaiting first telemetry packet',
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).textTheme.bodySmall?.color?.withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    SemStatusBadge(
                      label: online ? 'ONLINE' : (hasAnyPacket ? (stale ? 'STALE' : 'OFFLINE') : 'WAITING'),
                      color: online
                          ? SemColors.success
                          : (hasAnyPacket ? (stale ? SemColors.warning : SemColors.error) : SemColors.accentSecondary(context)),
                    ),
                    if (dev.wifiRssiDbm != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.signal_cellular_alt_rounded,
                                size: 15, color: online ? SemColors.accentPrimary(context) : SemColors.error),
                            const SizedBox(width: 3),
                            Text('${dev.wifiRssiDbm} dBm', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            const DashedDivider(),
            if ((fw?.updateAvailable == true && fw?.latestRelease != null) ||
                (ioCfg?.offlineBufferedCount ?? 0) > 0) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (fw?.updateAvailable == true && fw?.latestRelease != null)
                    ActionChip(
                      avatar: Icon(Icons.system_update_alt_rounded, size: 16, color: SemColors.accentPrimary(context)),
                      label: Text('Update v${fw!.latestRelease!.version} Ready',
                          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => DeviceSettingsScreen(deviceId: deviceId)),
                      ),
                    ),
                  if ((ioCfg?.offlineBufferedCount ?? 0) > 0)
                    SemStatusBadge(
                      label: '${ioCfg!.offlineBufferedCount} Offline Queued',
                      color: SemColors.warning,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            if (latest == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? SemColors.surfaceDark
                      : SemColors.lightCard.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Theme.of(context).dividerColor.withValues(alpha: 0.6)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.sensors_rounded, size: 18, color: SemColors.accentPrimary(context)),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Waiting for first ESP32-S3 telemetry packet...',
                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                        ),
                        TextButton(
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          onPressed: state.refreshProductionData,
                          child: const Text('Refresh', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Check that the ESP32-S3 is connected to Wi-Fi, EMQX Cloud Authentication matches ${dev.deviceId}, and the EMQX HTTP Webhook rule is enabled.',
                      style: TextStyle(fontSize: 11.5, color: SemColors.mutedText(context)),
                    ),
                  ],
                ),
              )
            else
              Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _MetricTile(
                          title: 'Voltage / Freq',
                          value: '${latest.voltageRms.toStringAsFixed(1)} V / ${latest.frequencyHz.toStringAsFixed(1)} Hz',
                        ),
                      ),
                      Expanded(child: PowerGaugeArcWidget(valueW: latest.activePowerW)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _MetricTile(
                          title: 'Current (${latest.powerFactor.toStringAsFixed(2)} PF)',
                          value: '${latest.currentRms.toStringAsFixed(2)} A (${latest.apparentPowerVa.toStringAsFixed(0)} VA)',
                        ),
                      ),
                      Expanded(
                        child: _MetricTile(
                          title: 'Total Energy',
                          value: '${latest.energyKwh.toStringAsFixed(2)} kWh',
                          highlight: true,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            const SizedBox(height: 14),
            // Dashed billing box matching AVR Manual Mode box
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? SemColors.surfaceDark
                    : SemColors.surfaceLight,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Theme.of(context).dividerColor, width: 1.2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Current Bi-Monthly Est. (LT-IA)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      Text(
                        '₹${bill.totalEstimatedAmountInr.toStringAsFixed(2)}',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: SemColors.accentPrimary(context)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Prev: ${bill.previousReading.toStringAsFixed(1)}', style: const TextStyle(fontSize: 12)),
                      Text('Curr: ${bill.currentReading.toStringAsFixed(1)}', style: const TextStyle(fontSize: 12)),
                      Text('${bill.unitsConsumed.toStringAsFixed(1)} Units', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: (bill.unitsConsumed / 500).clamp(0.0, 1.0),
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(99),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (primaryRelay != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? SemColors.cardDark
                      : SemColors.lightCard,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Relay CH1: ${primaryRelay.name}',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                          Text(
                            primaryRelay.schedules.isNotEmpty
                                ? 'Offline schedule: ${primaryRelay.schedules.first.startTimeIst}–${primaryRelay.schedules.first.stopTimeIst} IST'
                                : '${relays.length} relay(s) • NVS offline-ready',
                            style: const TextStyle(fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: primaryRelay.currentState,
                      onChanged: (next) => state.toggleRelay(deviceId, primaryRelay.id, next),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
            Row(
              children: [
                Expanded(
                  flex: 4,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      minimumSize: const Size(0, 42),
                    ),
                    icon: const Icon(Icons.monitor_heart_outlined, size: 17),
                    label: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Monitor', maxLines: 1, softWrap: false),
                    ),
                    onPressed: () {
                      state.selectDevice(deviceId);
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const MonitoringScreen()),
                      );
                    },
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  flex: 3,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                      minimumSize: const Size(0, 42),
                    ),
                    onPressed: () {
                      state.selectDevice(deviceId);
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => RelaysScreen(deviceId: deviceId)),
                      );
                    },
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Relays', maxLines: 1, softWrap: false),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  flex: 2,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                      minimumSize: const Size(0, 42),
                    ),
                    onPressed: () {
                      state.selectDevice(deviceId);
                      widget.onOpenBilling();
                    },
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Bill', maxLines: 1, softWrap: false),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                SizedBox(
                  width: 42,
                  height: 42,
                  child: IconButton.outlined(
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.settings_outlined, size: 20),
                    onPressed: () {
                      state.selectDevice(deviceId);
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => DeviceSettingsScreen(deviceId: deviceId)),
                      );
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String title;
  final String value;
  final bool highlight;

  const _MetricTile({required this.title, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Theme.of(context).textTheme.bodySmall?.color?.withValues(alpha: 0.7),
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: highlight ? SemColors.accentPrimary(context) : null,
          ),
        ),
      ],
    );
  }
}
