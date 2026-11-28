class UserProfile {
  final String id;
  final String fullName;
  final String email;
  final String mobileNumber;
  final String role;
  final String? organization;
  final String? avatarUrl;

  const UserProfile({
    required this.id,
    required this.fullName,
    required this.email,
    required this.mobileNumber,
    required this.role,
    this.organization,
    this.avatarUrl,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id']?.toString() ?? '',
        fullName: json['fullName']?.toString() ?? '',
        email: json['email']?.toString() ?? '',
        mobileNumber: json['mobileNumber']?.toString() ?? '',
        role: json['role']?.toString() ?? 'user',
        organization: json['organization']?.toString(),
        avatarUrl: json['avatarUrl']?.toString(),
      );

  UserProfile copyWith({String? fullName, String? mobileNumber, String? organization, String? avatarUrl}) {
    return UserProfile(
      id: id,
      fullName: fullName ?? this.fullName,
      email: email,
      mobileNumber: mobileNumber ?? this.mobileNumber,
      role: role,
      organization: organization ?? this.organization,
      avatarUrl: avatarUrl ?? this.avatarUrl,
    );
  }
}

class DeviceModel {
  final String id;
  final String deviceId;
  final String name;
  final String? locationLabel;
  final String serviceCategory;
  final bool consumerEligibleForSubsidy;
  final String? meterSerialNumber;
  final String firmwareVersion;
  final String hardwareVersion;
  final int telemetryIntervalSec;
  final String monitoringMode;
  final bool isOnline;
  final int? wifiRssiDbm;
  final String? lastSeenAt;
  final bool isDemo;

  const DeviceModel({
    required this.id,
    required this.deviceId,
    required this.name,
    this.locationLabel,
    required this.serviceCategory,
    required this.consumerEligibleForSubsidy,
    this.meterSerialNumber,
    required this.firmwareVersion,
    required this.hardwareVersion,
    required this.telemetryIntervalSec,
    required this.monitoringMode,
    required this.isOnline,
    this.wifiRssiDbm,
    this.lastSeenAt,
    this.isDemo = false,
  });

  factory DeviceModel.fromJson(Map<String, dynamic> json) => DeviceModel(
        id: json['id']?.toString() ?? '',
        deviceId: json['deviceId']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        locationLabel: json['locationLabel']?.toString(),
        serviceCategory: json['serviceCategory']?.toString() ?? 'LT-IA',
        consumerEligibleForSubsidy: json['consumerEligibleForSubsidy'] != false,
        meterSerialNumber: json['meterSerialNumber']?.toString(),
        firmwareVersion: json['firmwareVersion']?.toString() ?? '1.3.1',
        hardwareVersion: json['hardwareVersion']?.toString() ?? 'ESP32-S3-ADC1-REV3',
        telemetryIntervalSec: (json['telemetryIntervalSec'] as num?)?.toInt() ?? 10,
        monitoringMode: json['monitoringMode']?.toString() ?? 'automatic',
        isOnline: json['isOnline'] == true,
        wifiRssiDbm: (json['wifiRssiDbm'] as num?)?.toInt(),
        lastSeenAt: json['lastSeenAt']?.toString(),
        isDemo: json['isDemo'] == true,
      );

  DeviceModel copyWith({
    String? name,
    String? locationLabel,
    int? telemetryIntervalSec,
    String? monitoringMode,
    String? firmwareVersion,
  }) {
    return DeviceModel(
      id: id,
      deviceId: deviceId,
      name: name ?? this.name,
      locationLabel: locationLabel ?? this.locationLabel,
      serviceCategory: serviceCategory,
      consumerEligibleForSubsidy: consumerEligibleForSubsidy,
      meterSerialNumber: meterSerialNumber,
      firmwareVersion: firmwareVersion ?? this.firmwareVersion,
      hardwareVersion: hardwareVersion,
      telemetryIntervalSec: telemetryIntervalSec ?? this.telemetryIntervalSec,
      monitoringMode: monitoringMode ?? this.monitoringMode,
      isOnline: isOnline,
      wifiRssiDbm: wifiRssiDbm,
      lastSeenAt: lastSeenAt,
      isDemo: isDemo,
    );
  }
}

class DeviceSensorConfigModel {
  final String deviceId;
  final String voltageSensorModel;
  final String currentSensorModel;
  final String adcModel;
  final double voltageCalibrationFactor;
  final double currentCalibrationFactor;
  final double phaseCorrectionDeg;
  final double nominalFrequencyHz;
  final String? calibrationDate;
  final String calibrationStatus;
  final bool adcSpiOk;
  final bool drdyStatusOk;
  final String sensorHealthStatus;

  const DeviceSensorConfigModel({
    required this.deviceId,
    required this.voltageSensorModel,
    required this.currentSensorModel,
    required this.adcModel,
    required this.voltageCalibrationFactor,
    required this.currentCalibrationFactor,
    required this.phaseCorrectionDeg,
    required this.nominalFrequencyHz,
    this.calibrationDate,
    required this.calibrationStatus,
    required this.adcSpiOk,
    required this.drdyStatusOk,
    required this.sensorHealthStatus,
  });

  factory DeviceSensorConfigModel.fromJson(Map<String, dynamic> json) =>
      DeviceSensorConfigModel(
        deviceId: json['deviceId']?.toString() ?? '',
        voltageSensorModel: json['voltageSensorModel']?.toString() ?? 'ZMPT101B (GPIO 4)',
        currentSensorModel: json['currentSensorModel']?.toString() ?? 'SCT-013-000 + 22Ω (GPIO 5)',
        adcModel: json['adcModel']?.toString() ?? 'ESP32-S3 12-bit ADC1',
        voltageCalibrationFactor: (json['voltageCalibrationFactor'] as num?)?.toDouble() ?? 1.0,
        currentCalibrationFactor: (json['currentCalibrationFactor'] as num?)?.toDouble() ?? 1.0,
        phaseCorrectionDeg: (json['phaseCorrectionDeg'] as num?)?.toDouble() ?? 0.0,
        nominalFrequencyHz: (json['nominalFrequencyHz'] as num?)?.toDouble() ?? 50.0,
        calibrationDate: json['calibrationDate']?.toString(),
        calibrationStatus: json['calibrationStatus']?.toString() ?? 'factory_default',
        adcSpiOk: json['adcSpiOk'] != false,
        drdyStatusOk: json['drdyStatusOk'] != false,
        sensorHealthStatus: json['sensorHealthStatus']?.toString() ?? 'good',
      );
}

class TelemetryPointModel {
  final String deviceId;
  final double voltageRms;
  final double currentRms;
  final double activePowerW;
  final double apparentPowerVa;
  final double powerFactor;
  final double frequencyHz;
  final double energyKwh;
  final String deviceTimestamp;
  final String ingestedAt;
  final int? wifiRssiDbm;
  final bool isDemo;

  const TelemetryPointModel({
    required this.deviceId,
    required this.voltageRms,
    required this.currentRms,
    required this.activePowerW,
    required this.apparentPowerVa,
    required this.powerFactor,
    required this.frequencyHz,
    required this.energyKwh,
    required this.deviceTimestamp,
    required this.ingestedAt,
    this.wifiRssiDbm,
    this.isDemo = false,
  });

  factory TelemetryPointModel.fromJson(Map<String, dynamic> json) => TelemetryPointModel(
        deviceId: json['deviceId']?.toString() ?? '',
        voltageRms: (json['voltageRms'] as num?)?.toDouble() ?? 0,
        currentRms: (json['currentRms'] as num?)?.toDouble() ?? 0,
        activePowerW: (json['activePowerW'] as num?)?.toDouble() ?? 0,
        apparentPowerVa: (json['apparentPowerVa'] as num?)?.toDouble() ?? 0,
        powerFactor: (json['powerFactor'] as num?)?.toDouble() ?? 0,
        frequencyHz: (json['frequencyHz'] as num?)?.toDouble() ?? 0,
        energyKwh: (json['energyKwh'] as num?)?.toDouble() ?? 0,
        deviceTimestamp: json['deviceTimestamp']?.toString() ?? '',
        ingestedAt: json['ingestedAt']?.toString() ?? '',
        wifiRssiDbm: (json['wifiRssiDbm'] as num?)?.toInt(),
        isDemo: json['isDemo'] == true,
      );
}

class AlertEventModel {
  final String id;
  final String deviceId;
  final String alertType;
  final double thresholdValue;
  final double observedValue;
  final String severity;
  final String status;
  final String message;
  final String createdAt;
  final bool isDemo;

  const AlertEventModel({
    required this.id,
    required this.deviceId,
    required this.alertType,
    required this.thresholdValue,
    required this.observedValue,
    required this.severity,
    required this.status,
    required this.message,
    required this.createdAt,
    this.isDemo = false,
  });

  factory AlertEventModel.fromJson(Map<String, dynamic> json) => AlertEventModel(
        id: json['id']?.toString() ?? '',
        deviceId: json['deviceId']?.toString() ?? '',
        alertType: json['alertType']?.toString() ?? 'high_power',
        thresholdValue: (json['thresholdValue'] as num?)?.toDouble() ?? 0,
        observedValue: (json['observedValue'] as num?)?.toDouble() ?? 0,
        severity: json['severity']?.toString() ?? 'warning',
        status: json['status']?.toString() ?? 'active',
        message: json['message']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
        isDemo: json['isDemo'] == true,
      );

  AlertEventModel copyWith({String? status}) => AlertEventModel(
        id: id,
        deviceId: deviceId,
        alertType: alertType,
        thresholdValue: thresholdValue,
        observedValue: observedValue,
        severity: severity,
        status: status ?? this.status,
        message: message,
        createdAt: createdAt,
        isDemo: isDemo,
      );
}

const Set<int> kReservedEsp32Gpios = {4, 5, 19, 20, 26, 27, 28, 29, 30, 31, 32, 48};

class DeviceIoConfigModel {
  final String deviceId;
  final String statusLedMode;
  final int statusRgbGpio;
  final int statusSingleLedGpio;
  final bool pulseLedEnabled;
  final int pulseLedGpio;
  final int pulseImpPerKwh;
  final bool offlineBufferEnabled;
  final int offlineBufferedCount;

  const DeviceIoConfigModel({
    required this.deviceId,
    required this.statusLedMode,
    required this.statusRgbGpio,
    required this.statusSingleLedGpio,
    required this.pulseLedEnabled,
    required this.pulseLedGpio,
    required this.pulseImpPerKwh,
    required this.offlineBufferEnabled,
    required this.offlineBufferedCount,
  });

  factory DeviceIoConfigModel.fromJson(Map<String, dynamic> json) => DeviceIoConfigModel(
        deviceId: json['deviceId']?.toString() ?? '',
        statusLedMode: json['statusLedMode']?.toString() ?? 'inbuilt_rgb',
        statusRgbGpio: (json['statusRgbGpio'] as num?)?.toInt() ?? 48,
        statusSingleLedGpio: (json['statusSingleLedGpio'] as num?)?.toInt() ?? 2,
        pulseLedEnabled: json['pulseLedEnabled'] != false,
        pulseLedGpio: (json['pulseLedGpio'] as num?)?.toInt() ?? 21,
        pulseImpPerKwh: (json['pulseImpPerKwh'] as num?)?.toInt() ?? 1000,
        offlineBufferEnabled: json['offlineBufferEnabled'] != false,
        offlineBufferedCount: (json['offlineBufferedCount'] as num?)?.toInt() ?? 0,
      );

  DeviceIoConfigModel copyWith({
    String? statusLedMode,
    int? statusRgbGpio,
    int? statusSingleLedGpio,
    bool? pulseLedEnabled,
    int? pulseLedGpio,
    int? pulseImpPerKwh,
    bool? offlineBufferEnabled,
    int? offlineBufferedCount,
  }) {
    return DeviceIoConfigModel(
      deviceId: deviceId,
      statusLedMode: statusLedMode ?? this.statusLedMode,
      statusRgbGpio: statusRgbGpio ?? this.statusRgbGpio,
      statusSingleLedGpio: statusSingleLedGpio ?? this.statusSingleLedGpio,
      pulseLedEnabled: pulseLedEnabled ?? this.pulseLedEnabled,
      pulseLedGpio: pulseLedGpio ?? this.pulseLedGpio,
      pulseImpPerKwh: pulseImpPerKwh ?? this.pulseImpPerKwh,
      offlineBufferEnabled: offlineBufferEnabled ?? this.offlineBufferEnabled,
      offlineBufferedCount: offlineBufferedCount ?? this.offlineBufferedCount,
    );
  }
}

class RelayScheduleModel {
  final String id;
  final String relayId;
  final String deviceId;
  final String label;
  final String startTimeIst;
  final String stopTimeIst;
  final List<int> daysOfWeek;
  final bool enabled;
  final String timezone;

  const RelayScheduleModel({
    required this.id,
    required this.relayId,
    required this.deviceId,
    required this.label,
    required this.startTimeIst,
    required this.stopTimeIst,
    required this.daysOfWeek,
    required this.enabled,
    this.timezone = 'Asia/Kolkata',
  });

  factory RelayScheduleModel.fromJson(Map<String, dynamic> json) => RelayScheduleModel(
        id: json['id']?.toString() ?? '',
        relayId: json['relayId']?.toString() ?? '',
        deviceId: json['deviceId']?.toString() ?? '',
        label: json['label']?.toString() ?? 'Scheduled Load',
        startTimeIst: json['startTimeIst']?.toString() ?? '06:00',
        stopTimeIst: json['stopTimeIst']?.toString() ?? '07:00',
        daysOfWeek: (json['daysOfWeek'] as List<dynamic>? ?? [0, 1, 2, 3, 4, 5, 6])
            .map((e) => (e as num).toInt())
            .toList(),
        enabled: json['enabled'] != false,
        timezone: json['timezone']?.toString() ?? 'Asia/Kolkata',
      );

  RelayScheduleModel copyWith({bool? enabled}) => RelayScheduleModel(
        id: id,
        relayId: relayId,
        deviceId: deviceId,
        label: label,
        startTimeIst: startTimeIst,
        stopTimeIst: stopTimeIst,
        daysOfWeek: daysOfWeek,
        enabled: enabled ?? this.enabled,
        timezone: timezone,
      );
}

class DeviceRelayModel {
  final String id;
  final String deviceId;
  final int channelIndex;
  final String name;
  final int gpioPin;
  final bool activeHigh;
  final bool currentState;
  final bool failSafeState;
  final bool isConfirmedDefault;
  final List<RelayScheduleModel> schedules;

  const DeviceRelayModel({
    required this.id,
    required this.deviceId,
    required this.channelIndex,
    required this.name,
    required this.gpioPin,
    required this.activeHigh,
    required this.currentState,
    required this.failSafeState,
    required this.isConfirmedDefault,
    required this.schedules,
  });

  factory DeviceRelayModel.fromJson(Map<String, dynamic> json) => DeviceRelayModel(
        id: json['id']?.toString() ?? '',
        deviceId: json['deviceId']?.toString() ?? '',
        channelIndex: (json['channelIndex'] as num?)?.toInt() ?? 1,
        name: json['name']?.toString() ?? 'Optional Relay 1',
        gpioPin: (json['gpioPin'] as num?)?.toInt() ?? 15,
        activeHigh: json['activeHigh'] != false,
        currentState: json['currentState'] == true,
        failSafeState: json['failSafeState'] == true,
        isConfirmedDefault: json['isConfirmedDefault'] == true,
        schedules: (json['schedules'] as List<dynamic>? ?? [])
            .map((e) => RelayScheduleModel.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  DeviceRelayModel copyWith({bool? currentState, List<RelayScheduleModel>? schedules}) => DeviceRelayModel(
        id: id,
        deviceId: deviceId,
        channelIndex: channelIndex,
        name: name,
        gpioPin: gpioPin,
        activeHigh: activeHigh,
        currentState: currentState ?? this.currentState,
        failSafeState: failSafeState,
        isConfirmedDefault: isConfirmedDefault,
        schedules: schedules ?? this.schedules,
      );
}

class FirmwareReleaseModel {
  final String version;
  final String? tagName;
  final String? githubRepo;
  final String? binaryUrl;
  final String releaseNotes;
  final bool isUpdateAvailable;

  const FirmwareReleaseModel({
    required this.version,
    this.tagName,
    this.githubRepo,
    this.binaryUrl,
    required this.releaseNotes,
    this.isUpdateAvailable = false,
  });

  factory FirmwareReleaseModel.fromJson(Map<String, dynamic> json) => FirmwareReleaseModel(
        version: json['version']?.toString() ?? '1.0.0',
        tagName: json['tagName']?.toString(),
        githubRepo: json['githubRepo']?.toString(),
        binaryUrl: json['binaryUrl']?.toString(),
        releaseNotes: json['releaseNotes']?.toString() ?? '',
        isUpdateAvailable: json['isUpdateAvailable'] == true,
      );
}

class FirmwareOtaJobModel {
  final String id;
  final String deviceId;
  final String targetVersion;
  final String status;
  final int progressPct;
  final String createdAt;

  const FirmwareOtaJobModel({
    required this.id,
    required this.deviceId,
    required this.targetVersion,
    required this.status,
    required this.progressPct,
    required this.createdAt,
  });

  factory FirmwareOtaJobModel.fromJson(Map<String, dynamic> json) => FirmwareOtaJobModel(
        id: json['id']?.toString() ?? '',
        deviceId: json['deviceId']?.toString() ?? '',
        targetVersion: json['targetVersion']?.toString() ?? '',
        status: json['status']?.toString() ?? 'queued',
        progressPct: (json['progressPct'] as num?)?.toInt() ?? 0,
        createdAt: json['createdAt']?.toString() ?? '',
      );
}

class DeviceFirmwareStatusModel {
  final String currentVersion;
  final String? githubRepo;
  final FirmwareReleaseModel? latestRelease;
  final bool updateAvailable;
  final List<FirmwareOtaJobModel> jobs;

  const DeviceFirmwareStatusModel({
    required this.currentVersion,
    this.githubRepo,
    this.latestRelease,
    required this.updateAvailable,
    required this.jobs,
  });

  factory DeviceFirmwareStatusModel.fromJson(Map<String, dynamic> json) => DeviceFirmwareStatusModel(
        currentVersion: json['currentVersion']?.toString() ?? '1.0.0',
        githubRepo: json['githubRepo']?.toString(),
        latestRelease: json['latestRelease'] != null
            ? FirmwareReleaseModel.fromJson(json['latestRelease'] as Map<String, dynamic>)
            : null,
        updateAvailable: json['updateAvailable'] == true,
        jobs: (json['jobs'] as List<dynamic>? ?? [])
            .map((e) => FirmwareOtaJobModel.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
