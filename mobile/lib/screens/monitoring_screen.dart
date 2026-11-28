import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/sem_widgets.dart';
import '../widgets/telemetry_chart.dart';

class MonitoringScreen extends StatefulWidget {
  const MonitoringScreen({super.key});

  @override
  State<MonitoringScreen> createState() => _MonitoringScreenState();
}

class _MonitoringScreenState extends State<MonitoringScreen> {
  int _days = 1;
  bool _showMinMax = true;
  String _pair = 'vi';
  String? _loadedDeviceId;
  bool _loadingHistory = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncHistory(force: false));
  }

  Future<void> _syncHistory({bool force = true}) async {
    if (!mounted) return;
    final state = context.read<AppState>();
    final dev = state.selectedDevice;
    if (dev == null) return;
    if (!force && _loadedDeviceId == dev.deviceId && (state.historyByDevice[dev.deviceId]?.isNotEmpty ?? false)) {
      return;
    }
    setState(() => _loadingHistory = true);
    _loadedDeviceId = dev.deviceId;
    try {
      await state.refreshProductionData();
      await state.loadHistory(dev.deviceId, days: _days);
    } catch (_) {}
    if (mounted) {
      setState(() => _loadingHistory = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final latest = dev != null ? state.latestByDevice[dev.deviceId] : null;
    final pts = dev != null
        ? (state.historyByDevice[dev.deviceId] ?? <TelemetryPointModel>[])
        : <TelemetryPointModel>[];

    if (dev != null && _loadedDeviceId != dev.deviceId && !_loadingHistory) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncHistory(force: false));
    }

    final series = _pair == 'vi'
        ? [
            ChartSeriesData(
              label: 'Voltage',
              unit: 'V',
              color: SemColors.warning,
              points: pts.map((p) => (p.deviceTimestamp, p.voltageRms)).toList(),
            ),
            ChartSeriesData(
              label: 'Current',
              unit: 'A',
              color: SemColors.success,
              points: pts.map((p) => (p.deviceTimestamp, p.currentRms)).toList(),
            ),
          ]
        : [
            ChartSeriesData(
              label: 'Active Power',
              unit: 'W',
              color: SemColors.warning,
              points: pts.map((p) => (p.deviceTimestamp, p.activePowerW)).toList(),
            ),
            ChartSeriesData(
              label: 'Apparent Power',
              unit: 'VA',
              color: SemColors.accentPrimary(context),
              points: pts.map((p) => (p.deviceTimestamp, p.apparentPowerVa)).toList(),
            ),
          ];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Electrical Monitor', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (dev != null)
              Text('${dev.name} / ${dev.deviceId}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => _syncHistory(force: true),
        child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (dev == null)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('No device paired yet. Add an ESP32-S3 device from Dashboard first.'),
              ),
            )
          else ...[
          if (latest == null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: SemColors.warning.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: SemColors.warning.withValues(alpha: 0.5)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.hourglass_top_rounded, color: SemColors.warning, size: 20),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Waiting for first ESP32-S3 telemetry packet. Check Wi-Fi, EMQX Cloud Auth, and Webhook.',
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                  TextButton(
                    onPressed: _loadingHistory ? null : () => _syncHistory(force: true),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          // 3-column summary strip matching AVR Solar & Battery Log
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _SummaryBadge(
                          icon: Icons.bolt_rounded,
                          title: 'Voltage',
                          value: latest != null ? '${latest.voltageRms.toStringAsFixed(1)} V' : '--',
                        ),
                      ),
                      Expanded(
                        child: _SummaryBadge(
                          icon: Icons.verified_outlined,
                          title: 'Power Factor',
                          value: latest != null ? '${latest.powerFactor.toStringAsFixed(2)} PF' : '--',
                        ),
                      ),
                      Expanded(
                        child: _SummaryBadge(
                          icon: Icons.speed_rounded,
                          title: 'Active Power',
                          value: latest != null ? '${(latest.activePowerW / 1000).toStringAsFixed(2)} kW' : '--',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const DashedDivider(),
                  const SizedBox(height: 12),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    childAspectRatio: 2.1,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    children: [
                      _MeasureCell('Current', latest != null ? '${latest.currentRms.toStringAsFixed(2)} A' : '--'),
                      _MeasureCell('Apparent Power', latest != null ? '${latest.apparentPowerVa.toStringAsFixed(0)} VA' : '--'),
                      _MeasureCell('Frequency', latest != null ? '${latest.frequencyHz.toStringAsFixed(2)} Hz' : '--'),
                      _MeasureCell('Cumulative kWh', latest != null ? '${latest.energyKwh.toStringAsFixed(2)} kWh' : '--'),
                      _MeasureCell('Status', dev.isOnline == true ? 'Connected' : (latest == null ? 'Awaiting Data' : 'Offline')),
                      _MeasureCell('Last Update', IstTimeUtils.formatTimeIst(latest?.ingestedAt ?? dev.lastSeenAt)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: _days,
                          decoration: const InputDecoration(labelText: 'Select Date'),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('Today')),
                            DropdownMenuItem(value: 2, child: Text('Last 48 Hours')),
                            DropdownMenuItem(value: 7, child: Text('Last 7 Days')),
                          ],
                          onChanged: (v) async {
                            if (v != null) {
                              setState(() => _days = v);
                              await state.loadHistory(dev.deviceId, days: v);
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.outlined(
                        icon: _loadingHistory
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : Icon(Icons.refresh_rounded, color: SemColors.accentPrimary(context)),
                        onPressed: () => _syncHistory(force: true),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      DropdownButton<String>(
                        value: _pair,
                        items: const [
                          DropdownMenuItem(value: 'vi', child: Text('Voltage & Current')),
                          DropdownMenuItem(value: 'power', child: Text('Active & Apparent Power')),
                        ],
                        onChanged: (v) {
                          if (v != null) setState(() => _pair = v);
                        },
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Checkbox(
                            value: _showMinMax,
                            activeColor: SemColors.accentPrimary(context),
                            onChanged: (v) => setState(() => _showMinMax = v ?? true),
                          ),
                          const Text('Min / Max', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  InteractiveTelemetryChart(series: series, showMinMax: _showMinMax),
                ],
              ),
            ),
          ),
          ],
        ],
      ),
      ),
    );
  }
}

class _SummaryBadge extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  const _SummaryBadge({required this.icon, required this.title, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: SemColors.accentSecondary(context), size: 26),
        const SizedBox(height: 4),
        Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: SemColors.accentPrimary(context))),
      ],
    );
  }
}

class _MeasureCell extends StatelessWidget {
  final String label;
  final String value;
  const _MeasureCell(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? SemColors.surfaceDark : SemColors.lightCard,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
