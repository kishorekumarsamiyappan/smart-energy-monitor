import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../providers/app_state.dart';
import '../services/ble_provisioning_service.dart';

class AddDeviceScreen extends StatefulWidget {
  const AddDeviceScreen({super.key});

  @override
  State<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends State<AddDeviceScreen> {
  final BleProvisioningService _ble = BleProvisioningService();
  final _deviceIdCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _ssidCtrl = TextEditingController();
  final _wifiPassCtrl = TextEditingController();

  List<DiscoveredEspDevice> _discovered = [];
  DiscoveredEspDevice? _selectedBle;
  bool _scanning = false;
  bool _provisioning = false;
  bool _obscureWifi = true;
  bool _eligible = true;
  String? _statusMsg;
  String? _errorMsg;

  @override
  void dispose() {
    _deviceIdCtrl.dispose();
    _nameCtrl.dispose();
    _locationCtrl.dispose();
    _ssidCtrl.dispose();
    _wifiPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _scanBle() async {
    setState(() {
      _scanning = true;
      _errorMsg = null;
      _statusMsg = null;
    });
    try {
      final list = await _ble.scanNearbyEspDevices();
      setState(() {
        _discovered = list;
        _statusMsg = list.isEmpty
            ? 'No nearby SEM ESP32-S3 BLE devices detected. Ensure Bluetooth is ON and ESP32 is in provisioning mode, or pair manually below.'
            : 'Found ${list.length} nearby ESP32-S3 device(s).';
      });
    } catch (e) {
      setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _provisionAndSave() async {
    setState(() {
      _errorMsg = null;
      _statusMsg = null;
      _provisioning = true;
    });
    try {
      final id = _deviceIdCtrl.text.trim().toUpperCase();
      final name = _nameCtrl.text.trim();
      if (id.length < 4 || name.length < 2) {
        throw ArgumentError('Enter valid Device ID (min 4 chars) and Device Name.');
      }

      if (_selectedBle?.rawDevice != null && _ssidCtrl.text.trim().isNotEmpty) {
        await _ble.provisionDevice(
          device: _selectedBle!.rawDevice!,
          ssid: _ssidCtrl.text,
          wifiPassword: _wifiPassCtrl.text,
          deviceId: id,
          mqttUsername: 'dev_${id.toLowerCase()}',
          mqttSecret: '',
        );
      }

      if (!mounted) return;
      await context.read<AppState>().addDevice(
            deviceId: id,
            name: name,
            locationLabel: _locationCtrl.text.trim().isEmpty ? null : _locationCtrl.text.trim(),
            consumerEligible: _eligible,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _provisioning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Energy Device')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('1. Nearby ESP32-S3 (BLE)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                      ElevatedButton.icon(
                        icon: const Icon(Icons.bluetooth_searching_rounded, size: 18),
                        label: Text(_scanning ? 'Scanning...' : 'Scan BLE'),
                        onPressed: _scanning ? null : _scanBle,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_discovered.isNotEmpty)
                    for (final d in _discovered)
                      ListTile(
                        leading: const Icon(Icons.bluetooth_connected, color: SemColors.primary),
                        title: Text(d.name),
                        subtitle: Text('RSSI: ${d.rssi} dBm'),
                        selected: _selectedBle?.id == d.id,
                        onTap: () {
                          setState(() {
                            _selectedBle = d;
                            if (d.name.startsWith('SEM-')) {
                              _deviceIdCtrl.text = d.name.replaceFirst('SEM-', '');
                            }
                          });
                        },
                      ),
                  if (_selectedBle != null) ...[
                    const Divider(),
                    const Text('2. Wi-Fi Credentials (Never Logged)', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    TextField(controller: _ssidCtrl, decoration: const InputDecoration(labelText: '2.4 GHz Wi-Fi SSID')),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _wifiPassCtrl,
                      obscureText: _obscureWifi,
                      decoration: InputDecoration(
                        labelText: 'Wi-Fi Password',
                        suffixIcon: IconButton(
                          icon: Icon(_obscureWifi ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscureWifi = !_obscureWifi),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('3. Device Details & Cloud Pairing', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 12),
                  TextField(controller: _deviceIdCtrl, decoration: const InputDecoration(labelText: 'Device ID (e.g. DEVICE001)')),
                  const SizedBox(height: 10),
                  TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Device Name (e.g. Main Home DB)')),
                  const SizedBox(height: 10),
                  TextField(controller: _locationCtrl, decoration: const InputDecoration(labelText: 'Panel Location (Optional)')),
                  SwitchListTile(
                    value: _eligible,
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Eligible for TNEB LT-IA Subsidy', style: TextStyle(fontSize: 13)),
                    onChanged: (v) => setState(() => _eligible = v),
                  ),
                  if (_errorMsg != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(_errorMsg!, style: const TextStyle(color: SemColors.error, fontWeight: FontWeight.w600)),
                    ),
                  if (_statusMsg != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(_statusMsg!, style: const TextStyle(color: SemColors.primary, fontWeight: FontWeight.w600)),
                    ),
                  ElevatedButton(
                    onPressed: _provisioning ? null : _provisionAndSave,
                    child: Text(_provisioning ? 'Verifying & Saving...' : 'Save & Verify Connection'),
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
