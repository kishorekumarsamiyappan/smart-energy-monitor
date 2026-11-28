import 'dart:async';
import 'dart:convert';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

class DiscoveredEspDevice {
  final String id;
  final String name;
  final int rssi;
  final BluetoothDevice? rawDevice;

  const DiscoveredEspDevice({
    required this.id,
    required this.name,
    required this.rssi,
    this.rawDevice,
  });
}

class NearbyWifiNetwork {
  final String ssid;
  final int rssi;
  final bool authRequired;

  const NearbyWifiNetwork({
    required this.ssid,
    required this.rssi,
    required this.authRequired,
  });

  factory NearbyWifiNetwork.fromJson(Map<String, dynamic> json) {
    return NearbyWifiNetwork(
      ssid: (json['s'] ?? json['ssid'] ?? '').toString(),
      rssi: (json['r'] as num?)?.toInt() ?? -70,
      authRequired: json['a'] != 0 && json['a'] != false,
    );
  }
}

/// Handles NimBLE Wi-Fi scanning + cloud credential provisioning with ESP32-S3.
/// Security: Wi-Fi passwords and device MQTT secrets are NEVER logged.
class BleProvisioningService {
  static final Guid serviceUuid = Guid('73656d30-0001-4000-8000-00805f9b34fb');
  static final Guid wifiCredsCharUuid = Guid('73656d30-0002-4000-8000-00805f9b34fb');
  static final Guid statusCharUuid = Guid('73656d30-0003-4000-8000-00805f9b34fb');
  static final Guid wifiScanCharUuid = Guid('73656d30-0004-4000-8000-00805f9b34fb');

  Future<List<DiscoveredEspDevice>> scanNearbyEspDevices({
    Duration timeout = const Duration(seconds: 6),
  }) async {
    final adapterState = await FlutterBluePlus.adapterState
        .where((s) => s != BluetoothAdapterState.unknown)
        .first
        .timeout(const Duration(seconds: 4), onTimeout: () => BluetoothAdapterState.unknown);
    if (adapterState != BluetoothAdapterState.on) {
      throw StateError('Bluetooth is turned off. Enable Bluetooth and Nearby Devices permission to scan ESP32-S3 devices.');
    }

    final found = <String, DiscoveredEspDevice>{};
    final sub = FlutterBluePlus.scanResults.listen((results) {
      for (final r in results) {
        final name = r.device.platformName.isNotEmpty
            ? r.device.platformName
            : r.advertisementData.advName;
        if (name.startsWith('SEM-') ||
            r.advertisementData.serviceUuids.contains(serviceUuid)) {
          found[r.device.remoteId.str] = DiscoveredEspDevice(
            id: r.device.remoteId.str,
            name: name.isEmpty ? 'ESP32-S3 Monitor' : name,
            rssi: r.rssi,
            rawDevice: r.device,
          );
        }
      }
    });

    await FlutterBluePlus.startScan(timeout: timeout);
    await Future<void>.delayed(timeout);
    await FlutterBluePlus.stopScan();
    await sub.cancel();

    final list = found.values.toList();
    list.sort((a, b) => b.rssi.compareTo(a.rssi));
    return list;
  }

  Future<List<NearbyWifiNetwork>> scanNearbyWifi(BluetoothDevice device) async {
    await device.connect(timeout: const Duration(seconds: 12), autoConnect: false);
    try {
      try {
        await device.requestMtu(512);
      } catch (_) {}

      final services = await device.discoverServices();
      final targetService = services.firstWhere(
        (s) => s.uuid == serviceUuid,
        orElse: () => throw StateError('ESP32-S3 Smart Energy provisioning service not found.'),
      );
      final scanChar = targetService.characteristics.firstWhere(
        (c) => c.uuid == wifiScanCharUuid,
        orElse: () => throw StateError('ESP32 firmware does not support BLE Wi-Fi scanning yet. Re-flash latest firmware or enter SSID manually.'),
      );

      await scanChar.write(utf8.encode('scan'), withoutResponse: false);

      for (var i = 0; i < 20; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 500));
        final raw = await scanChar.read();
        final text = utf8.decode(raw, allowMalformed: true).trim();
        if (text.isEmpty || text == 'SCANNING') continue;
        final decoded = jsonDecode(text);
        if (decoded is List) {
          return decoded
              .whereType<Map<String, dynamic>>()
              .map(NearbyWifiNetwork.fromJson)
              .where((w) => w.ssid.isNotEmpty)
              .toList();
        }
        return [];
      }
      throw TimeoutException('Timed out waiting for ESP32-S3 nearby Wi-Fi scan.');
    } finally {
      await device.disconnect();
    }
  }

  Future<String> provisionDevice({
    required BluetoothDevice device,
    required String ssid,
    required String wifiPassword,
    required String deviceId,
    required String mqttUsername,
    required String mqttSecret,
  }) async {
    if (ssid.trim().isEmpty) {
      throw ArgumentError('Wi-Fi SSID is required.');
    }

    await device.connect(timeout: const Duration(seconds: 12), autoConnect: false);
    try {
      try {
        await device.requestMtu(512);
      } catch (_) {}

      final services = await device.discoverServices();
      final targetService = services.firstWhere(
        (s) => s.uuid == serviceUuid,
        orElse: () => throw StateError('ESP32-S3 Smart Energy provisioning service not found.'),
      );

      final credChar = targetService.characteristics.firstWhere(
        (c) => c.uuid == wifiCredsCharUuid,
        orElse: () => throw StateError('Provisioning characteristic missing.'),
      );
      final statusChar = targetService.characteristics.firstWhere(
        (c) => c.uuid == statusCharUuid,
        orElse: () => throw StateError('Status characteristic missing.'),
      );

      final payloadMap = <String, dynamic>{
        'ssid': ssid.trim(),
        'pass': wifiPassword,
        'device_id': deviceId.trim().toUpperCase(),
        if (mqttUsername.trim().isNotEmpty && mqttSecret.isNotEmpty) ...{
          'mqtt_user': mqttUsername.trim(),
          'mqtt_pass': mqttSecret,
        },
      };
      await credChar.write(utf8.encode(jsonEncode(payloadMap)), withoutResponse: false);

      // Poll provisioning status characteristic up to 15 seconds
      var wifiConnectedAt = -1;
      for (var i = 0; i < 15; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
        final raw = await statusChar.read();
        final statusText = utf8.decode(raw, allowMalformed: true).trim();
        if (statusText.contains('MQTT_READY') || statusText.contains('CLOUD_CONNECTED')) {
          return statusText;
        }
        if (statusText.contains('WIFI_FAIL')) {
          throw StateError('ESP32-S3 failed to join Wi-Fi. Check the Wi-Fi password and ensure it is 2.4 GHz.');
        }
        if (statusText.contains('AUTH_FAIL')) {
          throw StateError(
            'ESP32-S3 joined Wi-Fi, but EMQX rejected the MQTT username/password or ACL. '
            'Verify the exact case-sensitive user & password in EMQX Cloud -> Access Control -> Authentication.',
          );
        }
        if (statusText.contains('WIFI_CONNECTED')) {
          wifiConnectedAt = wifiConnectedAt == -1 ? i : wifiConnectedAt;
          if (mqttSecret.isEmpty && i - wifiConnectedAt >= 3) {
            return statusText;
          }
        }
      }
      return 'CREDENTIALS_SAVED_CONNECTING';
    } finally {
      await device.disconnect();
    }
  }

  /// Sends BLE NVS factory-reset command to an ESP32-S3 advertising `SEM-<id>`.
  Future<bool> factoryResetDeviceById(
    String deviceId, {
    Duration timeout = const Duration(seconds: 4),
  }) async {
    final targetSuffix = deviceId.trim().toUpperCase();
    final discovered = await scanNearbyEspDevices(timeout: timeout);
    DiscoveredEspDevice? match;
    for (final d in discovered) {
      final n = d.name.toUpperCase();
      if (n == 'SEM-$targetSuffix' || n.endsWith(targetSuffix)) {
        match = d;
        break;
      }
    }
    final raw = match?.rawDevice;
    if (raw == null) return false;

    await raw.connect(timeout: const Duration(seconds: 10), autoConnect: false);
    try {
      final services = await raw.discoverServices();
      final targetService = services.firstWhere((s) => s.uuid == serviceUuid);
      final credChar = targetService.characteristics.firstWhere((c) => c.uuid == wifiCredsCharUuid);
      await credChar.write(
        utf8.encode(jsonEncode({'action': 'factory_reset'})),
        withoutResponse: false,
      );
      return true;
    } finally {
      await raw.disconnect();
    }
  }
}
