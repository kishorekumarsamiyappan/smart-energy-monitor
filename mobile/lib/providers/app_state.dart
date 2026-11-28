import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/billing/tneb_billing_engine.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/demo_data_service.dart';

class AppState extends ChangeNotifier {
  final ApiService _api = ApiService();
  Timer? _livePollTimer;

  ThemeMode _themeMode = ThemeMode.light;
  bool _isInitialized = false;
  bool _isDemoMode = false;
  String? _token;
  UserProfile? _user;
  List<DeviceModel> _devices = [];
  String? _selectedDeviceId;
  final Map<String, TelemetryPointModel?> _latestByDevice = {};
  final Map<String, List<TelemetryPointModel>> _historyByDevice = {};
  final Map<String, DeviceSensorConfigModel> _sensorConfigByDevice = {};
  final Map<String, DeviceIoConfigModel> _ioConfigByDevice = {};
  final Map<String, List<DeviceRelayModel>> _relaysByDevice = {};
  final Map<String, DeviceFirmwareStatusModel> _firmwareByDevice = {};
  List<AlertEventModel> _alerts = [];
  String? _error;

  ThemeMode get themeMode => _themeMode;
  bool get isInitialized => _isInitialized;
  bool get isDemoMode => _isDemoMode;
  bool get isAuthenticated => _isDemoMode || (_user != null && _token != null);
  UserProfile? get user => _user;
  String? get token => _token;
  List<DeviceModel> get devices => _devices;
  String? get selectedDeviceId => _selectedDeviceId;
  DeviceModel? get selectedDevice {
    if (_devices.isEmpty) return null;
    return _devices.firstWhere(
      (d) => d.deviceId == _selectedDeviceId,
      orElse: () => _devices.first,
    );
  }
  Map<String, TelemetryPointModel?> get latestByDevice => _latestByDevice;
  Map<String, List<TelemetryPointModel>> get historyByDevice => _historyByDevice;
  Map<String, DeviceSensorConfigModel> get sensorConfigByDevice => _sensorConfigByDevice;
  Map<String, DeviceIoConfigModel> get ioConfigByDevice => _ioConfigByDevice;
  Map<String, List<DeviceRelayModel>> get relaysByDevice => _relaysByDevice;
  Map<String, DeviceFirmwareStatusModel> get firmwareByDevice => _firmwareByDevice;
  List<AlertEventModel> get alerts => _alerts;
  int get activeAlertsCount => _alerts.where((a) => a.status == 'active').length;
  String? get error => _error;

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    final themeStr = prefs.getString('sem_theme') ?? 'light';
    _themeMode = themeStr == 'dark' ? ThemeMode.dark : ThemeMode.light;

    final demo = prefs.getBool('sem_demo_mode') ?? false;
    if (demo) {
      _loadDemoData();
      _isInitialized = true;
      notifyListeners();
      return;
    }

    final savedToken = prefs.getString('sem_token');
    final savedUserJson = prefs.getString('sem_user');
    if (savedToken != null && savedUserJson != null) {
      _token = savedToken;
      _user = UserProfile.fromJson(jsonDecode(savedUserJson) as Map<String, dynamic>);
      await refreshProductionData();
      _startLivePolling();
    }

    _isInitialized = true;
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    _themeMode = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('sem_theme', mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }

  void toggleTheme() {
    setThemeMode(_themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light);
  }

  Future<void> enterDemoMode() async {
    _stopLivePolling();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('sem_demo_mode', true);
    await prefs.remove('sem_token');
    await prefs.remove('sem_user');
    _loadDemoData();
    notifyListeners();
  }

  void _loadDemoData() {
    _isDemoMode = true;
    _token = null;
    _user = DemoDataService.demoUser;
    _devices = DemoDataService.buildDemoDevices();
    _selectedDeviceId = _devices.first.deviceId;
    _latestByDevice.clear();
    _historyByDevice.clear();
    _sensorConfigByDevice.clear();
    _ioConfigByDevice.clear();
    _relaysByDevice.clear();
    _firmwareByDevice.clear();

    for (final dev in _devices) {
      final pts = DemoDataService.generateSeries(dev.deviceId, days: 1);
      _historyByDevice[dev.deviceId] = pts;
      _latestByDevice[dev.deviceId] = pts.last;
      _sensorConfigByDevice[dev.deviceId] = DeviceSensorConfigModel(
        deviceId: dev.deviceId,
        voltageSensorModel: 'ZMPT101B',
        currentSensorModel: 'SCT-013 (30A / 1V built-in burden)',
        adcModel: 'ADS131M02',
        voltageCalibrationFactor: 1.0042,
        currentCalibrationFactor: 0.9965,
        phaseCorrectionDeg: 1.15,
        nominalFrequencyHz: 50.0,
        calibrationDate: '2026-10-10',
        calibrationStatus: 'verified',
        adcSpiOk: true,
        drdyStatusOk: true,
        sensorHealthStatus: 'good',
      );
      final isSecond = dev.deviceId.endsWith('2');
      _ioConfigByDevice[dev.deviceId] = DeviceIoConfigModel(
        deviceId: dev.deviceId,
        statusLedMode: isSecond ? 'single_gpio' : 'inbuilt_rgb',
        statusRgbGpio: 48,
        statusSingleLedGpio: 2,
        pulseLedEnabled: true,
        pulseLedGpio: 21,
        pulseImpPerKwh: 1600,
        offlineBufferEnabled: true,
        offlineBufferedCount: isSecond ? 42 : 0,
      );
      _relaysByDevice[dev.deviceId] = [
        DeviceRelayModel(
          id: 'demo-relay-${dev.deviceId}-1',
          deviceId: dev.deviceId,
          channelIndex: 1,
          name: isSecond ? 'Confirmed Relay 1 (AC Contactor)' : 'Confirmed Relay 1 (Water Heater)',
          gpioPin: 4,
          activeHigh: true,
          currentState: isSecond,
          failSafeState: false,
          isConfirmedDefault: true,
          schedules: isSecond
              ? []
              : [
                  const RelayScheduleModel(
                    id: 'demo-sched-1',
                    relayId: 'demo-relay-DEMO-SEM-001-1',
                    deviceId: 'DEMO-SEM-001',
                    label: 'Morning Geyser Window',
                    startTimeIst: '06:00',
                    stopTimeIst: '07:00',
                    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                    enabled: true,
                  ),
                ],
        ),
      ];
      _firmwareByDevice[dev.deviceId] = DeviceFirmwareStatusModel(
        currentVersion: dev.firmwareVersion,
        githubRepo: 'smart-energy-monitor/esp32s3-firmware',
        latestRelease: const FirmwareReleaseModel(
          version: '1.3.0',
          tagName: 'v1.3.0',
          githubRepo: 'smart-energy-monitor/esp32s3-firmware',
          binaryUrl: 'https://github.com/smart-energy-monitor/esp32s3-firmware/releases/download/v1.3.0/sem-esp32s3-v1.3.0.bin',
          releaseNotes: 'GitHub FOTA rollback safety, offline SPIFFS buffer, offline RTC relays, pulse LED & RGB/Single status LED.',
          isUpdateAvailable: true,
        ),
        updateAvailable: true,
        jobs: const [],
      );
    }
    _alerts = DemoDataService.buildDemoAlerts();
    _error = null;
  }

  Future<void> login(String identifier, String password) async {
    final res = await _api.request('POST', '/auth/login', body: {
      'identifier': identifier.trim(),
      'password': password,
    });
    _isDemoMode = false;
    _token = res['token']?.toString();
    _user = UserProfile.fromJson(res['user'] as Map<String, dynamic>);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('sem_demo_mode', false);
    if (_token != null) await prefs.setString('sem_token', _token!);
    await prefs.setString('sem_user', jsonEncode(res['user']));

    await refreshProductionData();
    _startLivePolling();
    notifyListeners();
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String mobileNumber,
    required String password,
    String? organization,
  }) async {
    final res = await _api.request('POST', '/auth/register', body: {
      'fullName': fullName.trim(),
      'email': email.trim(),
      'mobileNumber': mobileNumber.trim(),
      'password': password,
      if (organization != null && organization.trim().isNotEmpty) 'organization': organization.trim(),
      'acceptedTerms': true,
    });
    if (res['token'] != null) {
      _isDemoMode = false;
      _token = res['token']?.toString();
      _user = UserProfile.fromJson(res['user'] as Map<String, dynamic>);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('sem_demo_mode', false);
      await prefs.setString('sem_token', _token!);
      await prefs.setString('sem_user', jsonEncode(res['user']));
      await refreshProductionData();
      _startLivePolling();
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> exchangeGoogleToken({
    String? supabaseAccessToken,
    String? googleIdToken,
  }) async {
    return _api.request('POST', '/auth/google', body: {
      'supabaseAccessToken': ?supabaseAccessToken,
      'googleIdToken': ?googleIdToken,
    });
  }

  Future<Map<String, dynamic>> sendEmailOtp(String email) async {
    return _api.request('POST', '/auth/otp/send', body: {'email': email.trim()});
  }

  Future<void> verifyEmailOtp({
    required String email,
    required String code,
    required String otpToken,
  }) async {
    final res = await _api.request('POST', '/auth/otp/verify', body: {
      'email': email.trim(),
      'code': code.trim(),
      'otpToken': otpToken,
    });
    _isDemoMode = false;
    _token = res['token']?.toString();
    _user = UserProfile.fromJson(res['user'] as Map<String, dynamic>);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('sem_demo_mode', false);
    if (_token != null) await prefs.setString('sem_token', _token!);
    await prefs.setString('sem_user', jsonEncode(res['user']));

    await refreshProductionData();
    _startLivePolling();
    notifyListeners();
  }

  Future<void> logout() async {
    _stopLivePolling();
    if (_token != null && !_isDemoMode) {
      try {
        await _api.request('POST', '/auth/logout', token: _token);
      } catch (_) {}
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('sem_token');
    await prefs.remove('sem_user');
    await prefs.setBool('sem_demo_mode', false);
    _isDemoMode = false;
    _token = null;
    _user = null;
    _devices = [];
    _selectedDeviceId = null;
    _latestByDevice.clear();
    _historyByDevice.clear();
    _ioConfigByDevice.clear();
    _relaysByDevice.clear();
    _firmwareByDevice.clear();
    _alerts = [];
    notifyListeners();
  }

  Future<void> refreshProductionData() async {
    if (_isDemoMode) {
      _loadDemoData();
      notifyListeners();
      return;
    }
    if (_token == null) return;
    try {
      final devRes = await _api.request('GET', '/devices', token: _token);
      final rawDevices = (devRes['devices'] as List<dynamic>? ?? []);
      _devices = rawDevices.map((e) => DeviceModel.fromJson(e as Map<String, dynamic>)).toList();
      if (_devices.isNotEmpty && (_selectedDeviceId == null || !_devices.any((d) => d.deviceId == _selectedDeviceId))) {
        _selectedDeviceId = _devices.first.deviceId;
      }

      for (final d in _devices) {
        try {
          final latestRes = await _api.request('GET', '/devices/${d.deviceId}/latest', token: _token);
          if (latestRes['latest'] != null) {
            _latestByDevice[d.deviceId] = TelemetryPointModel.fromJson(latestRes['latest'] as Map<String, dynamic>);
          }
          if (latestRes['sensorConfig'] != null) {
            _sensorConfigByDevice[d.deviceId] = DeviceSensorConfigModel.fromJson(latestRes['sensorConfig'] as Map<String, dynamic>);
          }
        } catch (_) {}

        try {
          final ioRes = await _api.request('GET', '/devices/${d.deviceId}/io-config', token: _token);
          if (ioRes['ioConfig'] != null) {
            _ioConfigByDevice[d.deviceId] = DeviceIoConfigModel.fromJson(ioRes['ioConfig'] as Map<String, dynamic>);
          }
        } catch (_) {}

        try {
          final relRes = await _api.request('GET', '/devices/${d.deviceId}/relays', token: _token);
          final rawRelays = (relRes['relays'] as List<dynamic>? ?? []);
          _relaysByDevice[d.deviceId] = rawRelays.map((e) => DeviceRelayModel.fromJson(e as Map<String, dynamic>)).toList();
        } catch (_) {}

        try {
          final fwRes = await _api.request('GET', '/devices/${d.deviceId}/firmware', token: _token);
          _firmwareByDevice[d.deviceId] = DeviceFirmwareStatusModel.fromJson(fwRes);
        } catch (_) {}

        if (d.deviceId == _selectedDeviceId || !_historyByDevice.containsKey(d.deviceId)) {
          try {
            final histRes = await _api.request('GET', '/devices/${d.deviceId}/history?days=1', token: _token);
            final pts = (histRes['points'] as List<dynamic>? ?? [])
                .map((e) => TelemetryPointModel.fromJson(e as Map<String, dynamic>))
                .toList();
            _historyByDevice[d.deviceId] = pts;
          } catch (_) {}
        }
      }

      final alertRes = await _api.request('GET', '/alerts', token: _token);
      final rawAlerts = (alertRes['alerts'] as List<dynamic>? ?? []);
      _alerts = rawAlerts.map((e) => AlertEventModel.fromJson(e as Map<String, dynamic>)).toList();
      _error = null;
    } catch (e) {
      _error = e.toString();
    }
    notifyListeners();
  }

  Future<List<TelemetryPointModel>> loadHistory(String deviceId, {int days = 1}) async {
    if (_isDemoMode) {
      final pts = DemoDataService.generateSeries(deviceId, days: days);
      _historyByDevice[deviceId] = pts;
      notifyListeners();
      return pts;
    }
    if (_token == null) return [];
    final res = await _api.request('GET', '/devices/$deviceId/history?days=$days', token: _token);
    final pts = (res['points'] as List<dynamic>? ?? [])
        .map((e) => TelemetryPointModel.fromJson(e as Map<String, dynamic>))
        .toList();
    _historyByDevice[deviceId] = pts;
    notifyListeners();
    return pts;
  }

  void selectDevice(String deviceId) {
    _selectedDeviceId = deviceId;
    notifyListeners();
  }

  Future<void> addDevice({
    required String deviceId,
    required String name,
    String? locationLabel,
    bool consumerEligible = true,
  }) async {
    final cleanId = deviceId.trim().toUpperCase();
    if (_isDemoMode) {
      final now = DateTime.now().toUtc().toIso8601String();
      final dev = DeviceModel(
        id: 'demo-${DateTime.now().millisecondsSinceEpoch}',
        deviceId: cleanId,
        name: name.trim(),
        locationLabel: locationLabel,
        serviceCategory: 'LT-IA',
        consumerEligibleForSubsidy: consumerEligible,
        firmwareVersion: '1.3.1-demo',
        hardwareVersion: 'ESP32-S3-ADC1-REV3',
        telemetryIntervalSec: 10,
        monitoringMode: 'automatic',
        isOnline: true,
        wifiRssiDbm: -57,
        lastSeenAt: now,
        isDemo: true,
      );
      _devices = [..._devices, dev];
      final pts = DemoDataService.generateSeries(cleanId, days: 1);
      _historyByDevice[cleanId] = pts;
      _latestByDevice[cleanId] = pts.last;
      _ioConfigByDevice[cleanId] = DeviceIoConfigModel(
        deviceId: cleanId,
        statusLedMode: 'inbuilt_rgb',
        statusRgbGpio: 48,
        statusSingleLedGpio: 2,
        pulseLedEnabled: true,
        pulseLedGpio: 21,
        pulseImpPerKwh: 1600,
        offlineBufferEnabled: true,
        offlineBufferedCount: 0,
      );
      _relaysByDevice[cleanId] = [
        DeviceRelayModel(
          id: 'demo-relay-$cleanId-1',
          deviceId: cleanId,
          channelIndex: 1,
          name: 'Confirmed Relay 1',
          gpioPin: 4,
          activeHigh: true,
          currentState: false,
          failSafeState: false,
          isConfirmedDefault: true,
          schedules: const [],
        ),
      ];
      _firmwareByDevice[cleanId] = const DeviceFirmwareStatusModel(
        currentVersion: '1.2.0-demo',
        githubRepo: 'smart-energy-monitor/esp32s3-firmware',
        latestRelease: FirmwareReleaseModel(
          version: '1.3.0',
          tagName: 'v1.3.0',
          githubRepo: 'smart-energy-monitor/esp32s3-firmware',
          binaryUrl: 'https://github.com/smart-energy-monitor/esp32s3-firmware/releases/download/v1.3.0/sem-esp32s3-v1.3.0.bin',
          releaseNotes: 'GitHub FOTA rollback safety, offline SPIFFS buffer, offline RTC relays, pulse LED & RGB/Single status LED.',
          isUpdateAvailable: true,
        ),
        updateAvailable: true,
        jobs: [],
      );
      _selectedDeviceId = cleanId;
      notifyListeners();
      return;
    }

    try {
      await _api.request('POST', '/devices', token: _token, body: {
        'deviceId': cleanId,
        'name': name.trim(),
        if (locationLabel != null) 'locationLabel': locationLabel.trim(),
        'serviceCategory': 'LT-IA',
        'consumerEligibleForSubsidy': consumerEligible,
      });
    } on ApiServiceException catch (e) {
      await refreshProductionData();
      if (e.statusCode == 409 && _devices.any((d) => d.deviceId == cleanId)) {
        _selectedDeviceId = cleanId;
        notifyListeners();
        return;
      }
      rethrow;
    }
    await refreshProductionData();
  }

  Future<void> renameDevice(String deviceId, String newName) async {
    if (_isDemoMode) {
      _devices = _devices.map((d) => d.deviceId == deviceId ? d.copyWith(name: newName) : d).toList();
      notifyListeners();
      return;
    }
    await _api.request('PATCH', '/devices/$deviceId', token: _token, body: {'name': newName});
    await refreshProductionData();
  }

  Future<void> updateTelemetryInterval(String deviceId, int intervalSec) async {
    final cleanSec = intervalSec.clamp(5, 3600);
    if (_isDemoMode) {
      _devices = _devices
          .map((d) => d.deviceId == deviceId ? d.copyWith(telemetryIntervalSec: cleanSec) : d)
          .toList();
      notifyListeners();
      return;
    }
    await _api.request('PATCH', '/devices/$deviceId', token: _token, body: {'telemetryIntervalSec': cleanSec});
    await refreshProductionData();
  }

  void _startLivePolling() {
    _livePollTimer?.cancel();
    if (_isDemoMode || _token == null) return;
    _livePollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_isDemoMode || _token == null) {
        _stopLivePolling();
        return;
      }
      refreshProductionData();
    });
  }

  void _stopLivePolling() {
    _livePollTimer?.cancel();
    _livePollTimer = null;
  }

  @override
  void dispose() {
    _stopLivePolling();
    super.dispose();
  }

  Future<void> removeDevice(String deviceId) async {
    if (_isDemoMode) {
      _devices = _devices.where((d) => d.deviceId != deviceId).toList();
      if (_selectedDeviceId == deviceId) {
        _selectedDeviceId = _devices.isNotEmpty ? _devices.first.deviceId : null;
      }
      notifyListeners();
      return;
    }
    await _api.request('DELETE', '/devices/$deviceId', token: _token);
    await refreshProductionData();
  }

  void acknowledgeAlert(String alertId) {
    _alerts = _alerts.map((a) => a.id == alertId ? a.copyWith(status: 'acknowledged') : a).toList();
    notifyListeners();
    if (!_isDemoMode && _token != null) {
      _api.request('POST', '/alerts/$alertId/acknowledge', token: _token).catchError((_) => <String, dynamic>{});
    }
  }

  BillCalculationSummary currentBillingEstimateFor(String deviceId) {
    final latest = _latestByDevice[deviceId];
    final currentKwh = _isDemoMode ? (latest?.energyKwh ?? 1685.4) : (latest?.energyKwh ?? 0.0);
    final cycleStart = _isDemoMode ? (deviceId.endsWith('2') ? 450.0 : 1320.0) : 0.0;
    final dev = _devices.firstWhere((d) => d.deviceId == deviceId, orElse: () => DemoDataService.buildDemoDevices().first);
    final nowDate = DateTime.now().toIso8601String().substring(0, 10);
    final prevDate = DateTime.now().subtract(const Duration(days: 60)).toIso8601String().substring(0, 10);
    return TnebBillingEngine.calculateIndicative2026(
      deviceId: deviceId,
      previousReading: cycleStart,
      currentReading: currentKwh >= cycleStart ? currentKwh : cycleStart,
      previousReadingDate: _isDemoMode ? '2026-10-01' : prevDate,
      currentReadingDate: _isDemoMode ? '2026-11-25' : nowDate,
      readingSource: 'automatic_esp32',
      consumerEligible: dev.consumerEligibleForSubsidy,
    );
  }

  Future<void> updateIoConfig(
    String deviceId, {
    String? statusLedMode,
    int? statusRgbGpio,
    int? statusSingleLedGpio,
    bool? pulseLedEnabled,
    int? pulseLedGpio,
    int? pulseImpPerKwh,
    bool? offlineBufferEnabled,
  }) async {
    if (_isDemoMode) {
      final prev = _ioConfigByDevice[deviceId] ??
          DeviceIoConfigModel(
            deviceId: deviceId,
            statusLedMode: 'inbuilt_rgb',
            statusRgbGpio: 48,
            statusSingleLedGpio: 2,
            pulseLedEnabled: true,
            pulseLedGpio: 21,
            pulseImpPerKwh: 1000,
            offlineBufferEnabled: true,
            offlineBufferedCount: 0,
          );
      _ioConfigByDevice[deviceId] = prev.copyWith(
        statusLedMode: statusLedMode,
        statusRgbGpio: statusRgbGpio,
        statusSingleLedGpio: statusSingleLedGpio,
        pulseLedEnabled: pulseLedEnabled,
        pulseLedGpio: pulseLedGpio,
        pulseImpPerKwh: pulseImpPerKwh,
        offlineBufferEnabled: offlineBufferEnabled,
      );
      notifyListeners();
      return;
    }
    final res = await _api.request('PATCH', '/devices/$deviceId/io-config', token: _token, body: {
      'statusLedMode': ?statusLedMode,
      'statusRgbGpio': ?statusRgbGpio,
      'statusSingleLedGpio': ?statusSingleLedGpio,
      'pulseLedEnabled': ?pulseLedEnabled,
      'pulseLedGpio': ?pulseLedGpio,
      'pulseImpPerKwh': ?pulseImpPerKwh,
      'offlineBufferEnabled': ?offlineBufferEnabled,
    });
    if (res['ioConfig'] != null) {
      _ioConfigByDevice[deviceId] = DeviceIoConfigModel.fromJson(res['ioConfig'] as Map<String, dynamic>);
    }
    notifyListeners();
  }

  Future<void> toggleRelay(String deviceId, String relayId, bool nextState) async {
    if (_isDemoMode) {
      final list = _relaysByDevice[deviceId] ?? [];
      _relaysByDevice[deviceId] = list.map((r) => r.id == relayId ? r.copyWith(currentState: nextState) : r).toList();
      notifyListeners();
      return;
    }
    await _api.request('PATCH', '/devices/$deviceId/relays/$relayId', token: _token, body: {'currentState': nextState});
    await refreshProductionData();
  }

  Future<void> addRelay(
    String deviceId, {
    required String name,
    required int gpioPin,
    bool activeHigh = true,
    bool failSafeState = false,
  }) async {
    if (_isDemoMode) {
      final list = _relaysByDevice[deviceId] ?? [];
      final maxCh = list.fold<int>(0, (acc, r) => r.channelIndex > acc ? r.channelIndex : acc);
      final relay = DeviceRelayModel(
        id: 'demo-relay-${DateTime.now().millisecondsSinceEpoch}',
        deviceId: deviceId,
        channelIndex: maxCh + 1,
        name: name.trim(),
        gpioPin: gpioPin,
        activeHigh: activeHigh,
        currentState: failSafeState,
        failSafeState: failSafeState,
        isConfirmedDefault: false,
        schedules: const [],
      );
      _relaysByDevice[deviceId] = [...list, relay];
      notifyListeners();
      return;
    }
    await _api.request('POST', '/devices/$deviceId/relays', token: _token, body: {
      'name': name.trim(),
      'gpioPin': gpioPin,
      'activeHigh': activeHigh,
      'failSafeState': failSafeState,
    });
    await refreshProductionData();
  }

  Future<void> deleteRelay(String deviceId, String relayId) async {
    if (_isDemoMode) {
      final list = _relaysByDevice[deviceId] ?? [];
      _relaysByDevice[deviceId] = list.where((r) => r.id != relayId).toList();
      notifyListeners();
      return;
    }
    await _api.request('DELETE', '/devices/$deviceId/relays/$relayId', token: _token);
    await refreshProductionData();
  }

  Future<void> addRelaySchedule(
    String deviceId,
    String relayId, {
    required String label,
    required String startTimeIst,
    required String stopTimeIst,
    required List<int> daysOfWeek,
    bool enabled = true,
  }) async {
    if (_isDemoMode) {
      final sched = RelayScheduleModel(
        id: 'demo-sched-${DateTime.now().millisecondsSinceEpoch}',
        relayId: relayId,
        deviceId: deviceId,
        label: label.trim(),
        startTimeIst: startTimeIst,
        stopTimeIst: stopTimeIst,
        daysOfWeek: daysOfWeek,
        enabled: enabled,
      );
      final list = _relaysByDevice[deviceId] ?? [];
      _relaysByDevice[deviceId] =
          list.map((r) => r.id == relayId ? r.copyWith(schedules: [...r.schedules, sched]) : r).toList();
      notifyListeners();
      return;
    }
    await _api.request('POST', '/devices/$deviceId/relays/$relayId/schedules', token: _token, body: {
      'label': label.trim(),
      'startTimeIst': startTimeIst,
      'stopTimeIst': stopTimeIst,
      'daysOfWeek': daysOfWeek,
      'enabled': enabled,
    });
    await refreshProductionData();
  }

  Future<void> toggleRelaySchedule(String deviceId, String relayId, String scheduleId, bool enabled) async {
    if (_isDemoMode) {
      final list = _relaysByDevice[deviceId] ?? [];
      _relaysByDevice[deviceId] = list
          .map((r) => r.id == relayId
              ? r.copyWith(
                  schedules: r.schedules.map((s) => s.id == scheduleId ? s.copyWith(enabled: enabled) : s).toList(),
                )
              : r)
          .toList();
      notifyListeners();
      return;
    }
    await _api.request('PATCH', '/devices/$deviceId/relays/$relayId/schedules/$scheduleId',
        token: _token, body: {'enabled': enabled});
    await refreshProductionData();
  }

  Future<void> deleteRelaySchedule(String deviceId, String relayId, String scheduleId) async {
    if (_isDemoMode) {
      final list = _relaysByDevice[deviceId] ?? [];
      _relaysByDevice[deviceId] = list
          .map((r) => r.id == relayId
              ? r.copyWith(schedules: r.schedules.where((s) => s.id != scheduleId).toList())
              : r)
          .toList();
      notifyListeners();
      return;
    }
    await _api.request('DELETE', '/devices/$deviceId/relays/$relayId/schedules/$scheduleId', token: _token);
    await refreshProductionData();
  }

  Future<void> triggerFirmwareOta(String deviceId) async {
    if (_isDemoMode) {
      final prev = _firmwareByDevice[deviceId];
      final targetVer = prev?.latestRelease?.version ?? '1.3.0';
      final job = FirmwareOtaJobModel(
        id: 'demo-ota-${DateTime.now().millisecondsSinceEpoch}',
        deviceId: deviceId,
        targetVersion: targetVer,
        status: 'succeeded',
        progressPct: 100,
        createdAt: DateTime.now().toUtc().toIso8601String(),
      );
      _devices = _devices.map((d) => d.deviceId == deviceId ? d.copyWith(firmwareVersion: targetVer) : d).toList();
      _firmwareByDevice[deviceId] = DeviceFirmwareStatusModel(
        currentVersion: targetVer,
        githubRepo: prev?.githubRepo ?? 'smart-energy-monitor/esp32s3-firmware',
        latestRelease: prev?.latestRelease != null
            ? FirmwareReleaseModel(
                version: prev!.latestRelease!.version,
                tagName: prev.latestRelease!.tagName,
                githubRepo: prev.latestRelease!.githubRepo,
                binaryUrl: prev.latestRelease!.binaryUrl,
                releaseNotes: prev.latestRelease!.releaseNotes,
                isUpdateAvailable: false,
              )
            : null,
        updateAvailable: false,
        jobs: [job, ...(prev?.jobs ?? [])],
      );
      notifyListeners();
      return;
    }
    await _api.request('POST', '/devices/$deviceId/ota', token: _token, body: {});
    await refreshProductionData();
  }
}
