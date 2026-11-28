import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  final _prevCtrl = TextEditingController(text: '0');
  final _currCtrl = TextEditingController(text: '0');
  bool _eligible = true;
  String _source = 'automatic_esp32';
  String? _loadedDeviceKey;

  @override
  void dispose() {
    _prevCtrl.dispose();
    _currCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadDraft(String deviceKey, bool defaultEligible) async {
    _loadedDeviceKey = deviceKey;
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _prevCtrl.text = prefs.getString('sem_bill_prev_$deviceKey') ?? '0';
      _currCtrl.text = prefs.getString('sem_bill_curr_$deviceKey') ?? '0';
      _source = prefs.getString('sem_bill_src_$deviceKey') ?? 'automatic_esp32';
      _eligible = prefs.getBool('sem_bill_elig_$deviceKey') ?? defaultEligible;
    });
  }

  Future<void> _saveDraft(String deviceKey) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('sem_bill_prev_$deviceKey', _prevCtrl.text);
    await prefs.setString('sem_bill_curr_$deviceKey', _currCtrl.text);
    await prefs.setString('sem_bill_src_$deviceKey', _source);
    await prefs.setBool('sem_bill_elig_$deviceKey', _eligible);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.selectedDevice;
    final latest = dev != null ? state.latestByDevice[dev.deviceId] : null;
    final deviceKey = dev?.deviceId ?? 'SEM_ESP32S3_01';
    if (_loadedDeviceKey != deviceKey) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _loadDraft(deviceKey, dev?.consumerEligibleForSubsidy ?? true);
      });
    }
    final prev = double.tryParse(_prevCtrl.text) ?? 0;
    final curr = double.tryParse(_currCtrl.text) ?? 0;

    BillCalculationSummary? summary;
    String? err;
    try {
      summary = TnebBillingEngine.calculateIndicative2026(
        deviceId: dev?.deviceId ?? 'SEM_ESP32S3_01',
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
                        onChanged: (_) {
                          _saveDraft(deviceKey);
                          setState(() {});
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _currCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Curr Reading (kWh)'),
                        onChanged: (_) {
                          _saveDraft(deviceKey);
                          setState(() {});
                        },
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
                    if (v != null) {
                      setState(() => _source = v);
                      _saveDraft(deviceKey);
                    }
                  },
                ),
                SwitchListTile(
                  value: _eligible,
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Eligible for TN Domestic Free-Unit Subsidy', style: TextStyle(fontSize: 13)),
                  onChanged: (v) {
                    setState(() => _eligible = v);
                    _saveDraft(deviceKey);
                  },
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton.icon(
                      icon: const Icon(Icons.sync_rounded, size: 16),
                      label: const Text('Sync Live kWh'),
                      onPressed: latest == null
                          ? null
                          : () {
                              setState(() => _currCtrl.text = latest.energyKwh.toStringAsFixed(2));
                              _saveDraft(deviceKey);
                            },
                    ),
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _prevCtrl.text = '0';
                          _currCtrl.text = '0';
                        });
                        _saveDraft(deviceKey);
                      },
                      child: const Text('Reset to 0 kWh'),
                    ),
                  ],
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
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: SemColors.accentPrimary(context)),
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
                  const SizedBox(height: 8),
                  Text(
                    'Tariff Reference: tneb-billcalculator.in (LT-IA Bi-Monthly Domestic Slabs)',
                    style: TextStyle(fontSize: 11.5, color: SemColors.mutedText(context), fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
