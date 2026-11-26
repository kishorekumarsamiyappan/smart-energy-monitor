import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().email('Valid email address required'),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^[+]?[0-9]{10,15}$/, 'Valid mobile number (10-15 digits) required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  organization: z.string().trim().max(120).optional(),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and privacy policy' }),
  }),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Email or mobile number is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createDeviceSchema = z.object({
  deviceId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{4,32}$/, 'Device ID must be 4-32 alphanumeric/dash/underscore chars'),
  name: z.string().trim().min(2, 'Device name is required').max(80),
  locationLabel: z.string().trim().max(80).optional(),
  serviceCategory: z.literal('LT-IA').default('LT-IA'),
  consumerEligibleForSubsidy: z.boolean().default(true),
  meterSerialNumber: z.string().trim().max(40).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  locationLabel: z.string().trim().max(80).nullable().optional(),
  consumerEligibleForSubsidy: z.boolean().optional(),
  telemetryIntervalSec: z.number().int().min(1).max(3600).optional(),
  monitoringMode: z.enum(['automatic', 'manual_preferred']).optional(),
  meterSerialNumber: z.string().trim().max(40).nullable().optional(),
});

export const mqttTelemetryPayloadSchema = z.object({
  device_id: z.string().trim().min(3).max(64),
  voltage_rms: z.number().finite().min(0).max(450),
  current_rms: z.number().finite().min(0).max(100),
  active_power: z.number().finite().min(-35000).max(35000),
  apparent_power: z.number().finite().min(0).max(40000),
  power_factor: z.number().finite().min(-1).max(1),
  frequency: z.number().finite().min(0).max(70),
  energy_kwh: z.number().finite().min(0),
  timestamp: z.string().datetime({ offset: true }),
  wifi_rssi: z.number().int().min(-120).max(0).optional(),
  seq: z.number().int().nonnegative().optional(),
  buffered: z.boolean().optional(),
});

export const manualReadingInputSchema = z.object({
  deviceId: z.string().trim().min(3).max(64),
  previousReading: z.number().finite().min(0),
  previousReadingDate: z.string().min(8),
  currentReading: z.number().finite().min(0),
  currentReadingDate: z.string().min(8),
  meterSerialNumber: z.string().trim().max(40).optional(),
  billPhotoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional(),
  preferredSource: z.enum(['automatic_esp32', 'manual_eb_meter']).optional(),
});

export const alertRuleSchema = z.object({
  deviceId: z.string().trim().min(3).max(64),
  alertType: z.enum([
    'high_current',
    'overcurrent_warning',
    'high_power',
    'abnormal_voltage',
    'low_power_factor',
    'device_offline',
    'sensor_failure',
    'unusual_consumption',
  ]),
  thresholdValue: z.number().finite(),
  comparisonOperator: z.enum(['gt', 'lt', 'outside_range']),
  secondaryThreshold: z.number().finite().nullable().optional(),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  enabled: z.boolean().default(true),
  pushEnabled: z.boolean().default(true),
});

export const billingCalculateRequestSchema = z.object({
  deviceId: z.string().trim().min(3).max(64),
  previousReading: z.number().finite().min(0),
  currentReading: z.number().finite().min(0),
  previousReadingDate: z.string().min(8),
  currentReadingDate: z.string().min(8),
  readingSource: z.enum(['automatic_esp32', 'manual_eb_meter']),
  consumerEligible: z.boolean().default(true),
  fixedChargesInr: z.number().finite().min(0).default(0),
  additionalChargesInr: z.number().finite().min(0).default(0),
});

export const RESERVED_ESP32_GPIOS = new Set([9, 10, 11, 12, 13, 14, 19, 20, 26, 27, 28, 29, 30, 31, 32]);

export const createRelaySchema = z.object({
  name: z.string().trim().min(2).max(60),
  gpioPin: z
    .number()
    .int()
    .min(1)
    .max(48)
    .refine((pin) => !RESERVED_ESP32_GPIOS.has(pin), {
      message: 'Selected GPIO pin is reserved for ADS131M02 SPI, USB, or Flash.',
    }),
  activeHigh: z.boolean().default(true),
  failSafeState: z.boolean().default(false),
});

export const updateRelaySchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  currentState: z.boolean().optional(),
  failSafeState: z.boolean().optional(),
  activeHigh: z.boolean().optional(),
});

export const relayScheduleSchema = z.object({
  label: z.string().trim().min(1).max(60).default('Scheduled Load'),
  startTimeIst: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM format'),
  stopTimeIst: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM format'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  enabled: z.boolean().default(true),
});

export const deviceIoConfigSchema = z.object({
  statusLedMode: z.enum(['inbuilt_rgb', 'single_gpio', 'disabled']).optional(),
  statusRgbGpio: z.number().int().min(1).max(48).optional(),
  statusSingleLedGpio: z.number().int().min(1).max(48).optional(),
  pulseLedEnabled: z.boolean().optional(),
  pulseLedGpio: z.number().int().min(1).max(48).optional(),
  pulseImpPerKwh: z.number().int().min(100).max(10000).optional(),
  offlineBufferEnabled: z.boolean().optional(),
});

export const triggerOtaSchema = z.object({
  targetVersion: z.string().trim().min(1).max(40).optional(),
  binaryUrl: z.string().url().optional(),
  checksumSha256: z.string().trim().max(64).optional(),
});
