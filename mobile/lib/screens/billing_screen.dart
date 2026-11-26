import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/billing/tneb_billing_engine.dart';
import '../core/theme/app_theme.dart';
import '../providers/app_state.dart';
import 'manual_reading_screen.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  final _prevCtrl = TextEditingController(text: '1320');
  final _currCtrl = TextEditingController(text: '1685.4');
  bool _eligible = true;
  String _source = 'automatic_esp32';

  @override
  void dispose() {
    _prevCtrl.dispose();
    _currCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final prev = double.tryParse(_prevCtrl.text) ?? 0;
    final curr = double.tryParse(_currCtrl.text) ?? 0;

    BillCalculationSummary? summary;
    String? err;
    try {
      summary = TnebBillingEngine.calculateIndicative2026(
        deviceId: dev?.deviceId ?? 'DEVICE001',
        previousReading: prev,
        currentReading: curr,
        previousReadingDate: '2026-10-01',
        currentReadingDate: '2026-11-25',
        readingSource: _source,
        consumerEligible: _eligible,
      );
    } catch (e) {
      err = e.toString();
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Expanded(
              child: Text('TNEB / TNPDCL LT-IA Billing', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            ElevatedButton.icon(
              icon: const Icon(Icons.edit_note_rounded, size: 18),
              label: const Text('Manual Meter'),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ManualReadingScreen()),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: SemColors.warning.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: SemColors.warning.withValues(alpha: 0.45)),
          ),
          child: const Text(
            'ESTIMATE ONLY — Indicative 2026 LT-IA schedule. Verify official TNERC/TNPDCL orders before official billing.',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _prevCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Prev Reading (kWh)'),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _currCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Curr Reading (kWh)'),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _source,
                  decoration: const InputDecoration(labelText: 'Reading Source'),
                  items: const [
                    DropdownMenuItem(value: 'automatic_esp32', child: Text('Automatic ESP32 Counter')),
                    DropdownMenuItem(value: 'manual_eb_meter', child: Text('Manual EB Meter Reading')),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _source = v);
                  },
                ),
                SwitchListTile(
                  value: _eligible,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Eligible for TN Domestic Free-Unit Subsidy', style: TextStyle(fontSize: 13)),
                  onChanged: (v) => setState(() => _eligible = v),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (err != null)
          Text(err, style: const TextStyle(color: SemColors.error, fontWeight: FontWeight.w600))
        else if (summary != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Estimated Amount', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      Text(
                        '₹${summary.totalEstimatedAmountInr.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: SemColors.primary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Units: ${summary.unitsConsumed} kWh • Free: ${summary.freeUnitsApplied} • Branch: ${summary.branchApplied}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  const Divider(height: 20),
                  const Text('Slab Breakdown', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  for (final s in summary.slabs)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${s.label} (${s.units} × ₹${s.rateInr.toStringAsFixed(2)})',
                              style: const TextStyle(fontSize: 13)),
                          Text(
                            s.isSubsidyFree ? 'FREE' : '₹${s.amountInr.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: s.isSubsidyFree ? SemColors.success : null,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
