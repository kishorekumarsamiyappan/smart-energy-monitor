import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/sem_widgets.dart';

class RelaysScreen extends StatefulWidget {
  final String deviceId;

  const RelaysScreen({super.key, required this.deviceId});

  @override
  State<RelaysScreen> createState() => _RelaysScreenState();
}

class _RelaysScreenState extends State<RelaysScreen> {
  final _nameCtrl = TextEditingController();
  final _gpioCtrl = TextEditingController(text: '5');
  bool _activeHigh = true;
  bool _failSafe = false;

  static const List<String> _dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _gpioCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final dev = state.devices.firstWhere(
      (d) => d.deviceId == widget.deviceId,
      orElse: () => state.devices.first,
    );
    final relays = state.relaysByDevice[dev.deviceId] ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Relays & Offline Schedules', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text('${dev.name} / ${dev.deviceId}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: SemColors.lightCard,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.wifi_off_rounded, color: SemColors.primary, size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Schedules sync to ESP32-S3 NVS flash and continue running on local RTC even when Wi-Fi or cloud disconnects. Relays do not replace MCB/RCCB breakers.',
                    style: TextStyle(fontSize: 12.5, color: SemColors.textLight),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          for (final relay in relays) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: SemColors.primary,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'CH${relay.channelIndex}',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            relay.name,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ),
                        Switch(
                          value: relay.currentState,
                          onChanged: (val) => state.toggleRelay(dev.deviceId, relay.id, val),
                        ),
                      ],
                    ),
                    Text(
                      'GPIO ${relay.gpioPin} • ${relay.activeHigh ? "Active High" : "Active Low"} • Boot fail-safe: ${relay.failSafeState ? "ON" : "OFF"}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    if (relay.channelIndex == 1)
                      const Padding(
                        padding: EdgeInsets.only(top: 6),
                        child: SemStatusBadge(label: 'CONFIRMED DEFAULT RELAY', color: SemColors.secondary),
                      ),
                    const SizedBox(height: 10),
                    const DashedDivider(),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Offline Schedules (${relay.schedules.length})',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        TextButton.icon(
                          icon: const Icon(Icons.add_alarm_rounded, size: 17),
                          label: const Text('Add Schedule'),
                          onPressed: () => _showAddScheduleDialog(context, state, dev.deviceId, relay),
                        ),
                      ],
                    ),
                    if (relay.schedules.isEmpty)
                      const Text('No schedules configured for this relay.', style: TextStyle(fontSize: 12))
                    else
                      for (final sched in relay.schedules)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(sched.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                          subtitle: Text(
                            '${sched.startTimeIst} - ${sched.stopTimeIst} IST • ${sched.daysOfWeek.length == 7 ? "Every day" : sched.daysOfWeek.map((d) => _dayLabels[d]).join(", ")}',
                            style: const TextStyle(fontSize: 11.5),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Switch(
                                value: sched.enabled,
                                onChanged: (en) => state.toggleRelaySchedule(dev.deviceId, relay.id, sched.id, en),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: SemColors.error, size: 20),
                                onPressed: () => state.deleteRelaySchedule(dev.deviceId, relay.id, sched.id),
                              ),
                            ],
                          ),
                        ),
                    if (relay.channelIndex > 1)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          style: TextButton.styleFrom(foregroundColor: SemColors.error),
                          icon: const Icon(Icons.delete_forever_outlined, size: 18),
                          label: const Text('Remove Channel'),
                          onPressed: () => state.deleteRelay(dev.deviceId, relay.id),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Add Expansion Relay (CH2–CH8)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(labelText: 'New Relay Name', hintText: 'e.g. Water Pump'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _gpioCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'ESP32-S3 GPIO Pin (1-48)'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Active High Trigger'),
                    value: _activeHigh,
                    onChanged: (v) => setState(() => _activeHigh = v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Fail-Safe ON on Boot'),
                    value: _failSafe,
                    onChanged: (v) => setState(() => _failSafe = v),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.add_circle_outline),
                      label: const Text('Add New Relay'),
                      onPressed: () async {
                        final pin = int.tryParse(_gpioCtrl.text.trim()) ?? -1;
                        if (_nameCtrl.text.trim().length < 2) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Enter a relay name (min 2 chars).')),
                          );
                          return;
                        }
                        if (pin < 1 || pin > 48 || kReservedEsp32Gpios.contains(pin)) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('GPIO $pin is invalid or reserved for ADS131M02 SPI/Flash.')),
                          );
                          return;
                        }
                        if (relays.any((r) => r.gpioPin == pin)) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('GPIO $pin is already used by another relay.')),
                          );
                          return;
                        }
                        await state.addRelay(
                          dev.deviceId,
                          name: _nameCtrl.text.trim(),
                          gpioPin: pin,
                          activeHigh: _activeHigh,
                          failSafeState: _failSafe,
                        );
                        _nameCtrl.clear();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Expansion relay added and synced to NVS.')),
                          );
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showAddScheduleDialog(
    BuildContext context,
    AppState state,
    String deviceId,
    DeviceRelayModel relay,
  ) async {
    final labelCtrl = TextEditingController(text: 'Scheduled Timer');
    final startCtrl = TextEditingController(text: '06:00');
    final stopCtrl = TextEditingController(text: '07:30');
    final selectedDays = <int>{0, 1, 2, 3, 4, 5, 6};

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Schedule for CH${relay.channelIndex}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: labelCtrl, decoration: const InputDecoration(labelText: 'Label')),
                const SizedBox(height: 8),
                TextField(controller: startCtrl, decoration: const InputDecoration(labelText: 'Start Time (IST HH:MM)')),
                const SizedBox(height: 8),
                TextField(controller: stopCtrl, decoration: const InputDecoration(labelText: 'Stop Time (IST HH:MM)')),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  children: [
                    for (var i = 0; i < 7; i++)
                      FilterChip(
                        label: Text(_dayLabels[i], style: const TextStyle(fontSize: 11)),
                        selected: selectedDays.contains(i),
                        onSelected: (sel) {
                          setDialogState(() {
                            if (sel) {
                              selectedDays.add(i);
                            } else if (selectedDays.length > 1) {
                              selectedDays.remove(i);
                            }
                          });
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                final days = selectedDays.toList()..sort();
                await state.addRelaySchedule(
                  deviceId,
                  relay.id,
                  label: labelCtrl.text.trim().isEmpty ? 'Scheduled Load' : labelCtrl.text.trim(),
                  startTimeIst: startCtrl.text.trim(),
                  stopTimeIst: stopCtrl.text.trim(),
                  daysOfWeek: days,
                );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Save Schedule'),
            ),
          ],
        ),
      ),
    );
  }
}
