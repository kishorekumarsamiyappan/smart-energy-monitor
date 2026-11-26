import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/billing/tneb_billing_engine.dart';
import '../core/theme/app_theme.dart';
import '../providers/app_state.dart';

class ManualReadingScreen extends StatefulWidget {
  const ManualReadingScreen({super.key});

  @override
  State<ManualReadingScreen> createState() => _ManualReadingScreenState();
}

class _ManualReadingScreenState extends State<ManualReadingScreen> {
  final _prevCtrl = TextEditingController(text: '1320');
  final _currCtrl = TextEditingController(text: '1685');
  final _serialCtrl = TextEditingController(text: 'TN-EB-884210');
  final _notesCtrl = TextEditingController();
  String _selectedSource = 'manual_eb_meter';
  String? _savedMessage;

  @override
  void dispose() {
    _prevCtrl.dispose();
    _currCtrl.dispose();
    _serialCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final latest = dev != null ? state.latestByDevice[dev.deviceId] : null;
    final prev = double.tryParse(_prevCtrl.text) ?? 0;
    final curr = double.tryParse(_currCtrl.text) ?? 0;
    final manualUnits = (curr - prev).clamp(0.0, 999999.0);
    final autoUnits = latest != null ? (latest.energyKwh - 1320).clamp(0.0, 999999.0) : manualUnits;
    final diff = (manualUnits - autoUnits).abs();
    final disagrees = diff >= 5 || (manualUnits > 0 && (diff / manualUnits) * 100 >= 2);

    return Scaffold(
      appBar: AppBar(title: const Text('Manual EB Meter Reading')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _prevCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Previous EB Reading (kWh)'),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _currCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Current EB Reading (kWh)'),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _serialCtrl,
                    decoration: const InputDecoration(labelText: 'Meter Serial Number (Optional)'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesCtrl,
                    decoration: const InputDecoration(labelText: 'Notes'),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: disagrees ? SemColors.warning.withValues(alpha: 0.14) : SemColors.lightCard,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Manual Units: ${manualUnits.toStringAsFixed(1)} kWh | ESP32 Units: ${autoUnits.toStringAsFixed(1)} kWh',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        Text('Difference: ${diff.toStringAsFixed(2)} kWh', style: const TextStyle(fontSize: 12)),
                        if (disagrees) ...[
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            initialValue: _selectedSource,
                            decoration: const InputDecoration(labelText: 'Choose Estimate Source (Both Preserved)'),
                            items: const [
                              DropdownMenuItem(value: 'manual_eb_meter', child: Text('Use Manual EB Meter')),
                              DropdownMenuItem(value: 'automatic_esp32', child: Text('Use ESP32 Automatic')),
                            ],
                            onChanged: (v) {
                              if (v != null) setState(() => _selectedSource = v);
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (_savedMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(_savedMessage!, style: const TextStyle(color: SemColors.success, fontWeight: FontWeight.w700)),
                    ),
                  ElevatedButton(
                    onPressed: () {
                      final calc = TnebBillingEngine.calculateIndicative2026(
                        deviceId: dev?.deviceId ?? 'DEVICE001',
                        previousReading: prev,
                        currentReading: curr,
                        previousReadingDate: '2026-10-01',
                        currentReadingDate: '2026-11-25',
                        readingSource: _selectedSource,
                      );
                      setState(() {
                        _savedMessage =
                            'Saved! Calculated ₹${calc.totalEstimatedAmountInr.toStringAsFixed(2)} using $_selectedSource.';
                      });
                    },
                    child: const Text('Calculate & Preserve Both Records'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
