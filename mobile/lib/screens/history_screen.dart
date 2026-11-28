import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../services/report_export_service.dart';
import '../widgets/sem_widgets.dart';
import '../widgets/telemetry_chart.dart';

enum HistoryMetricTab { voltage, current, power, energy, pf, frequency }

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  HistoryMetricTab _tab = HistoryMetricTab.voltage;
  int _days = 1;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final pts = dev != null ? (state.historyByDevice[dev.deviceId] ?? <TelemetryPointModel>[]) : <TelemetryPointModel>[];

    double pick(TelemetryPointModel p) => switch (_tab) {
          HistoryMetricTab.voltage => p.voltageRms,
          HistoryMetricTab.current => p.currentRms,
          HistoryMetricTab.power => p.activePowerW,
          HistoryMetricTab.energy => p.energyKwh,
          HistoryMetricTab.pf => p.powerFactor,
          HistoryMetricTab.frequency => p.frequencyHz,
        };

    final unit = switch (_tab) {
      HistoryMetricTab.voltage => 'V',
      HistoryMetricTab.current => 'A',
      HistoryMetricTab.power => 'W',
      HistoryMetricTab.energy => 'kWh',
      HistoryMetricTab.pf => 'PF',
      HistoryMetricTab.frequency => 'Hz',
    };

    var minVal = pts.isEmpty ? 0.0 : double.infinity;
    var maxVal = pts.isEmpty ? 0.0 : double.negativeInfinity;
    var sumVal = 0.0;
    var peakPower = 0.0;
    for (final p in pts) {
      final v = pick(p);
      minVal = math.min(minVal, v);
      maxVal = math.max(maxVal, v);
      sumVal += v;
      peakPower = math.max(peakPower, p.activePowerW);
    }
    final avgVal = pts.isEmpty ? 0.0 : sumVal / pts.length;
    final totalKwh = pts.length >= 2 ? math.max(0.0, pts.last.energyKwh - pts.first.energyKwh) : 0.0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                dev != null ? '${dev.name} (${dev.deviceId})' : 'Energy History',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
              ),
            ),
            IconButton.filled(
              style: IconButton.styleFrom(backgroundColor: SemColors.primary),
              icon: const Icon(Icons.download_rounded, color: Colors.white),
              onPressed: dev == null ? null : () => ReportExportService.shareCsv(dev.deviceId, pts),
              tooltip: 'Export CSV',
            ),
            const SizedBox(width: 6),
            OutlinedButton(
              onPressed: dev == null
                  ? null
                  : () => ReportExportService.sharePdf(dev.deviceId, 'Energy History', pts, state.isDemoMode),
              child: const Text('PDF'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SegmentedPillTabs<HistoryMetricTab>(
          active: _tab,
          onChanged: (v) => setState(() => _tab = v),
          tabs: const [
            (HistoryMetricTab.voltage, 'Voltage'),
            (HistoryMetricTab.current, 'Current'),
            (HistoryMetricTab.power, 'Power'),
            (HistoryMetricTab.energy, 'Energy'),
            (HistoryMetricTab.pf, 'PF'),
            (HistoryMetricTab.frequency, 'Frequency'),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _days,
                decoration: const InputDecoration(labelText: 'Start date - End date'),
                items: const [
                  DropdownMenuItem(value: 1, child: Text('Today')),
                  DropdownMenuItem(value: 2, child: Text('Yesterday / 48h')),
                  DropdownMenuItem(value: 7, child: Text('Last 7 days')),
                  DropdownMenuItem(value: 30, child: Text('Last 30 days')),
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
              icon: Icon(Icons.refresh_rounded, color: SemColors.accentPrimary(context)),
              onPressed: () {
                if (dev != null) state.loadHistory(dev.deviceId, days: _days);
              },
            ),
          ],
        ),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          childAspectRatio: 1.5,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: [
            _StatBox('Min', '${minVal.toStringAsFixed(1)} $unit'),
            _StatBox('Max', '${maxVal.toStringAsFixed(1)} $unit'),
            _StatBox('Average', '${avgVal.toStringAsFixed(1)} $unit'),
            _StatBox('Total kWh', '${totalKwh.toStringAsFixed(2)} kWh'),
            _StatBox('Peak Power', '${peakPower.toStringAsFixed(0)} W'),
            _StatBox('Daily Avg', '${(totalKwh / _days).toStringAsFixed(2)} kWh'),
          ],
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: InteractiveTelemetryChart(
              series: [
                ChartSeriesData(
                  label: _tab.name.toUpperCase(),
                  unit: unit,
                  color: SemColors.accentSecondary(context),
                  points: pts.map((p) => (p.deviceTimestamp, pick(p))).toList(),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  const _StatBox(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: isDark ? SemColors.cardDark : SemColors.lightCard,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: SemColors.accentPrimary(context)),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
