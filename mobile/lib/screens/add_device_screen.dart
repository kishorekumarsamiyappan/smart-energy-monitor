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
  final _mqttUserCtrl = TextEditingController();
  final _mqttPassCtrl = TextEditingController();
  final _wifiPassFocus = FocusNode();

  List<DiscoveredEspDevice> _discovered = [];
  DiscoveredEspDevice? _selectedBle;
  List<NearbyWifiNetwork> _wifiNetworks = [];
  NearbyWifiNetwork? _selectedWifi;
  bool _scanningBle = false;
  bool _scanningWifi = false;
  bool _provisioning = false;
  bool _obscureWifi = true;
  bool _obscureMqtt = true;
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
    _mqttUserCtrl.dispose();
    _mqttPassCtrl.dispose();
    _wifiPassFocus.dispose();
    super.dispose();
  }

  Future<void> _scanBle() async {
    setState(() {
      _scanningBle = true;
      _errorMsg = null;
      _statusMsg = null;
    });
    try {
      final list = await _ble.scanNearbyEspDevices();
      if (!mounted) return;
      setState(() {
        _discovered = list;
        _statusMsg = list.isEmpty
            ? 'No nearby SEM ESP32-S3 BLE devices detected. Ensure Bluetooth is ON and ESP32 is powered, or pair manually below.'
            : 'Found ${list.length} nearby ESP32-S3 device(s). Tap one to scan nearby Wi-Fi.';
      });
    } catch (e) {
      if (mounted) setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _scanningBle = false);
    }
  }

  Future<void> _selectBleDevice(DiscoveredEspDevice d) async {
    final extractedId = d.name.startsWith('SEM-')
        ? d.name.replaceFirst('SEM-', '').trim().toUpperCase()
        : d.name.trim().toUpperCase();
    final resolvedId = extractedId.isNotEmpty ? extractedId : 'SEM_ESP32S3_01';
    setState(() {
      _selectedBle = d;
      _selectedWifi = null;
      _wifiNetworks = [];
      _errorMsg = null;
      _deviceIdCtrl.text = resolvedId;
      _mqttUserCtrl.text = resolvedId;
      if (_nameCtrl.text.trim().isEmpty) {
        _nameCtrl.text = resolvedId == 'SEM_ESP32S3_01' ? 'SEM Meter 01' : 'SEM Meter ($resolvedId)';
      }
      if (_locationCtrl.text.trim().isEmpty) {
        _locationCtrl.text = 'Main Electrical Panel';
      }
    });
    await _scanNearbyWifi();
  }

  Future<void> _scanNearbyWifi() async {
    final raw = _selectedBle?.rawDevice;
    if (raw == null) return;
    setState(() {
      _scanningWifi = true;
      _errorMsg = null;
      _statusMsg = 'Scanning nearby 2.4 GHz Wi-Fi from ESP32-S3...';
    });
    try {
      final aps = await _ble.scanNearbyWifi(raw);
      if (!mounted) return;
      setState(() {
        _wifiNetworks = aps;
        _statusMsg = aps.isEmpty
            ? 'No 2.4 GHz Wi-Fi networks returned. Tap Scan Wi-Fi again or enter SSID manually.'
            : 'Found ${aps.length} nearby 2.4 GHz Wi-Fi network(s). Tap one and enter its password.';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMsg = e.toString();
          _statusMsg = null;
        });
      }
    } finally {
      if (mounted) setState(() => _scanningWifi = false);
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

      if (_selectedBle?.rawDevice != null) {
        if (_ssidCtrl.text.trim().isEmpty) {
          throw ArgumentError('Select a nearby Wi-Fi network or enter your 2.4 GHz Wi-Fi SSID.');
        }
        setState(() => _statusMsg = 'Sending Wi-Fi credentials to ESP32-S3 over BLE...');
        final bleStatus = await _ble.provisionDevice(
          device: _selectedBle!.rawDevice!,
          ssid: _ssidCtrl.text,
          wifiPassword: _wifiPassCtrl.text,
          deviceId: id,
          mqttUsername: _mqttUserCtrl.text.trim().isEmpty ? id : _mqttUserCtrl.text.trim(),
          mqttSecret: _mqttPassCtrl.text,
        );
        if (!mounted) return;
        setState(() => _statusMsg = 'ESP32 status: $bleStatus');
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
      if (mounted) setState(() => _errorMsg = e.toString());
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
                        icon: _scanningBle
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.bluetooth_searching_rounded, size: 18),
                        label: Text(_scanningBle ? 'Scanning...' : 'Scan BLE'),
                        onPressed: _scanningBle ? null : _scanBle,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_discovered.isNotEmpty)
                    for (final d in _discovered)
                      ListTile(
                        leading: Icon(
                          Icons.bluetooth_connected,
                          color: _selectedBle?.id == d.id ? SemColors.success : SemColors.accentPrimary(context),
                        ),
                        title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('RSSI: ${d.rssi} dBm • ${d.id}'),
                        trailing: _selectedBle?.id == d.id ? const Icon(Icons.check_circle, color: SemColors.success) : null,
                        selected: _selectedBle?.id == d.id,
                        onTap: _scanningWifi ? null : () => _selectBleDevice(d),
                      ),
                  if (_selectedBle != null) ...[
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                          child: Text(
                            '2. Nearby 2.4 GHz Wi-Fi',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                          ),
                        ),
                        OutlinedButton.icon(
                          icon: _scanningWifi
                              ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.wifi_find_rounded, size: 18),
                          label: Text(_scanningWifi ? 'Scanning...' : 'Scan Wi-Fi'),
                          onPressed: _scanningWifi ? null : _scanNearbyWifi,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_wifiNetworks.isNotEmpty)
                      Container(
                        constraints: const BoxConstraints(maxHeight: 220),
                        decoration: BoxDecoration(
                          border: Border.all(color: Theme.of(context).dividerColor),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: _wifiNetworks.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (_, idx) {
                            final net = _wifiNetworks[idx];
                            final selected = _selectedWifi?.ssid == net.ssid || _ssidCtrl.text == net.ssid;
                            return ListTile(
                              dense: true,
                              leading: Icon(
                                net.rssi >= -65 ? Icons.wifi_rounded : Icons.wifi_2_bar_rounded,
                                color: selected ? SemColors.success : SemColors.accentPrimary(context),
                              ),
                              title: Text(net.ssid, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text('${net.rssi} dBm • ${net.authRequired ? "Secured" : "Open"}'),
                              trailing: Icon(
                                selected ? Icons.check_circle : (net.authRequired ? Icons.lock_outline : Icons.lock_open),
                                size: 18,
                                color: selected ? SemColors.success : null,
                              ),
                              selected: selected,
                              onTap: () {
                                setState(() {
                                  _selectedWifi = net;
                                  _ssidCtrl.text = net.ssid;
                                });
                                if (net.authRequired) {
                                  _wifiPassFocus.requestFocus();
                                }
                              },
                            );
                          },
                        ),
                      ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _ssidCtrl,
                      decoration: const InputDecoration(
                        labelText: '2.4 GHz Wi-Fi SSID',
                        hintText: 'Tap a network above or enter SSID manually',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _wifiPassCtrl,
                      focusNode: _wifiPassFocus,
                      obscureText: _obscureWifi,
                      decoration: InputDecoration(
                        labelText: _selectedWifi?.authRequired == false ? 'Wi-Fi Password (Open network)' : 'Wi-Fi Password',
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
                  TextField(controller: _deviceIdCtrl, decoration: const InputDecoration(labelText: 'Device ID (e.g. SEM_ESP32S3_01)')),
                  const SizedBox(height: 10),
                  TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Device Name (e.g. SEM Meter 01)')),
                  const SizedBox(height: 10),
                  TextField(controller: _locationCtrl, decoration: const InputDecoration(labelText: 'Panel Location (e.g. Main Electrical Panel)')),
                  if (_selectedBle != null) ...[
                    const SizedBox(height: 10),
                    ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      title: const Text('EMQX MQTT Credentials', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                      subtitle: const Text(
                        'Enter on first setup (or leave password blank if already saved on ESP32)',
                        style: TextStyle(fontSize: 12),
                      ),
                      children: [
                        TextField(
                          controller: _mqttUserCtrl,
                          decoration: const InputDecoration(labelText: 'MQTT Username (e.g. SEM_ESP32S3_01)'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _mqttPassCtrl,
                          obscureText: _obscureMqtt,
                          decoration: InputDecoration(
                            labelText: 'MQTT Password',
                            suffixIcon: IconButton(
                              icon: Icon(_obscureMqtt ? Icons.visibility : Icons.visibility_off),
                              onPressed: () => setState(() => _obscureMqtt = !_obscureMqtt),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ],
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
                      child: Text(
                        _statusMsg!,
                        style: TextStyle(color: SemColors.accentPrimary(context), fontWeight: FontWeight.w600),
                      ),
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
