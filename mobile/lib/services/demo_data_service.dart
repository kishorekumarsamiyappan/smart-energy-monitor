import 'dart:math' as math;
import '../models/models.dart';

class DemoDataService {
  static const UserProfile demoUser = UserProfile(
    id: 'demo-user-001',
    fullName: 'Arjun Krishnan (Demo)',
    email: 'demo@smartenergymonitor.local',
    mobileNumber: '9876543210',
    role: 'user',
    organization: 'Demo Residence - Chennai',
  );

  static List<DeviceModel> buildDemoDevices() {
    final now = DateTime.now().toUtc();
    return [
      DeviceModel(
        id: 'demo-dev-uuid-1',
        deviceId: 'DEMO-SEM-001',
        name: 'Main Home DB (Demo)',
        locationLabel: 'Chennai Home - Ground Floor',
        serviceCategory: 'LT-IA',
        consumerEligibleForSubsidy: true,
        meterSerialNumber: 'TN-EB-884210',
        firmwareVersion: '1.2.0-demo',
        hardwareVersion: 'ESP32-S3-ADS131M02-REV2',
        telemetryIntervalSec: 5,
        monitoringMode: 'automatic',
        isOnline: true,
        wifiRssiDbm: -54,
        lastSeenAt: now.toIso8601String(),
        isDemo: true,
      ),
      DeviceModel(
        id: 'demo-dev-uuid-2',
        deviceId: 'DEMO-SEM-002',
        name: 'First Floor AC Sub-Meter (Demo)',
        locationLabel: 'First Floor Panel',
        serviceCategory: 'LT-IA',
        consumerEligibleForSubsidy: true,
        meterSerialNumber: 'TN-EB-884211',
        firmwareVersion: '1.2.0-demo',
        hardwareVersion: 'ESP32-S3-ADS131M02-REV2',
        telemetryIntervalSec: 5,
        monitoringMode: 'automatic',
        isOnline: false,
        wifiRssiDbm: -78,
        lastSeenAt: now.subtract(const Duration(minutes: 18)).toIso8601String(),
        isDemo: true,
      ),
    ];
  }

  static List<TelemetryPointModel> generateSeries(String deviceId, {int days = 1}) {
    final now = DateTime.now().toUtc();
    final stepMinutes = days <= 1 ? 15 : (days <= 7 ? 60 : 240);
    final count = math.max(12, (days * 24 * 60) ~/ stepMinutes);
    final start = now.subtract(Duration(minutes: count * stepMinutes));
    final offset = deviceId.endsWith('2') ? 1.4 : 0.0;
    var kwh = deviceId.endsWith('2') ? 610.2 : 1420.5;
    final list = <TelemetryPointModel>[];

    for (var i = 0; i <= count; i++) {
      final t = start.add(Duration(minutes: i * stepMinutes));
      final istMin = (t.hour * 60 + t.minute + 330) % 1440;
      final hour = istMin / 60.0;

      var basePower = 220.0;
      if (hour >= 6.5 && hour <= 9.0) {
        basePower = 1850;
      } else if (hour >= 12.5 && hour <= 16.5) {
        basePower = 1450;
      } else if (hour >= 18.5 && hour <= 22.5) {
        basePower = 2150;
      } else if (hour > 9.0 && hour < 12.5) {
        basePower = 680;
      }

      final ripple = math.sin(i * 0.7 + offset) * 140 + math.cos(i * 0.35) * 60;
      final power = math.max(90.0, basePower + ripple);
      final voltage = 230.2 + math.sin(i * 0.45) * 4.6;
      final pf = 0.88 + math.sin(i * 0.3) * 0.08;
      final apparent = power / math.max(0.65, pf);
      final current = apparent / voltage;
      final freq = 50.0 + math.sin(i * 0.25) * 0.08;

      if (i > 0) {
        kwh += (power * (stepMinutes / 60.0)) / 1000.0;
      }

      final iso = t.toIso8601String();
      list.add(TelemetryPointModel(
        deviceId: deviceId,
        voltageRms: (voltage * 10).roundToDouble() / 10,
        currentRms: (current * 100).roundToDouble() / 100,
        activePowerW: power.roundToDouble(),
        apparentPowerVa: apparent.roundToDouble(),
        powerFactor: (pf * 100).roundToDouble() / 100,
        frequencyHz: (freq * 100).roundToDouble() / 100,
        energyKwh: (kwh * 1000).roundToDouble() / 1000,
        deviceTimestamp: iso,
        ingestedAt: iso,
        wifiRssiDbm: deviceId.endsWith('2') ? -76 : -54,
        isDemo: true,
      ));
    }
    return list;
  }

  static List<AlertEventModel> buildDemoAlerts() {
    final now = DateTime.now().toUtc();
    return [
      AlertEventModel(
        id: 'demo-alert-1',
        deviceId: 'DEMO-SEM-001',
        alertType: 'high_power',
        thresholdValue: 2500,
        observedValue: 2680,
        severity: 'warning',
        status: 'active',
        message: '[DEMO] Peak domestic load exceeded 2500 W threshold (2680 W). Advisory alert only.',
        createdAt: now.subtract(const Duration(minutes: 25)).toIso8601String(),
        isDemo: true,
      ),
      AlertEventModel(
        id: 'demo-alert-2',
        deviceId: 'DEMO-SEM-002',
        alertType: 'device_offline',
        thresholdValue: 120,
        observedValue: 1080,
        severity: 'critical',
        status: 'active',
        message: '[DEMO] Sub-meter DEMO-SEM-002 offline for 18 minutes.',
        createdAt: now.subtract(const Duration(minutes: 18)).toIso8601String(),
        isDemo: true,
      ),
    ];
  }
}
