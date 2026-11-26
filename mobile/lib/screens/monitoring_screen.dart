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

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final latest = dev != null ? state.latestByDevice[dev.deviceId] : null;
    final pts = dev != null
        ? (state.historyByDevice[dev.deviceId] ?? <TelemetryPointModel>[])
        : <TelemetryPointModel>[];

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
              color: SemColors.primary,
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
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 3-column summary strip matching AVR Solar & Battery Log
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _SummaryBadge(
                        icon: Icons.bolt_rounded,
                        title: 'Voltage',
                        value: latest != null ? '${latest.voltageRms.toStringAsFixed(1)} V' : '--',
                      ),
                      _SummaryBadge(
                        icon: Icons.verified_outlined,
                        title: 'Power Factor',
                        value: latest != null ? '${latest.powerFactor.toStringAsFixed(2)} PF' : '--',
                      ),
                      _SummaryBadge(
                        icon: Icons.speed_rounded,
                        title: 'Active Power',
                        value: latest != null ? '${(latest.activePowerW / 1000).toStringAsFixed(2)} kW' : '--',
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
                    childAspectRatio: 2.35,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    children: [
                      _MeasureCell('Current', latest != null ? '${latest.currentRms.toStringAsFixed(2)} A' : '--'),
                      _MeasureCell('Apparent Power', latest != null ? '${latest.apparentPowerVa.toStringAsFixed(0)} VA' : '--'),
                      _MeasureCell('Frequency', latest != null ? '${latest.frequencyHz.toStringAsFixed(2)} Hz' : '--'),
                      _MeasureCell('Cumulative kWh', latest != null ? '${latest.energyKwh.toStringAsFixed(2)} kWh' : '--'),
                      _MeasureCell('Status', dev?.isOnline == true ? 'Connected' : 'Offline'),
                      _MeasureCell('Last Update', IstTimeUtils.formatTimeIst(latest?.ingestedAt ?? dev?.lastSeenAt)),
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
                            if (v != null && dev != null) {
                              setState(() => _days = v);
                              await state.loadHistory(dev.deviceId, days: v);
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.outlined(
                        icon: const Icon(Icons.refresh_rounded, color: SemColors.primary),
                        onPressed: () {
                          if (dev != null) state.loadHistory(dev.deviceId, days: _days);
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                        children: [
                          Checkbox(
                            value: _showMinMax,
                            activeColor: SemColors.primary,
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
        Icon(icon, color: SemColors.secondary, size: 26),
        const SizedBox(height: 4),
        Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: SemColors.primary)),
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
