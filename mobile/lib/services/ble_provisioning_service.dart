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

/// Handles NimBLE Wi-Fi + cloud credential provisioning with ESP32-S3.
/// Security: Wi-Fi passwords and device MQTT secrets are NEVER logged.
class BleProvisioningService {
  static final Guid serviceUuid = Guid('73656d30-0001-4000-8000-00805f9b34fb');
  static final Guid wifiCredsCharUuid = Guid('73656d30-0002-4000-8000-00805f9b34fb');
  static final Guid statusCharUuid = Guid('73656d30-0003-4000-8000-00805f9b34fb');

  Future<List<DiscoveredEspDevice>> scanNearbyEspDevices({
    Duration timeout = const Duration(seconds: 6),
  }) async {
    final adapterState = await FlutterBluePlus.adapterState.first;
    if (adapterState != BluetoothAdapterState.on) {
      throw StateError('Bluetooth is turned off. Enable Bluetooth and location permissions to scan ESP32-S3 devices.');
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

    return found.values.toList();
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

      final payload = utf8.encode(jsonEncode({
        'ssid': ssid.trim(),
        'pass': wifiPassword,
        'device_id': deviceId.trim().toUpperCase(),
        'mqtt_user': mqttUsername,
        'mqtt_pass': mqttSecret,
      }));
      await credChar.write(payload, withoutResponse: false);

      // Poll provisioning status characteristic up to 15 seconds
      for (var i = 0; i < 15; i++) {
        await Future<void>.delayed(const Duration(seconds: 1));
        final raw = await statusChar.read();
        final statusText = utf8.decode(raw, allowMalformed: true).trim();
        if (statusText.contains('MQTT_READY') || statusText.contains('CLOUD_CONNECTED')) {
          return statusText;
        }
        if (statusText.contains('WIFI_FAIL') || statusText.contains('AUTH_FAIL')) {
          throw StateError('ESP32 failed to connect: $statusText');
        }
      }
      return 'CREDENTIALS_SENT_VERIFY_CLOUD';
    } finally {
      await device.disconnect();
    }
  }
}
