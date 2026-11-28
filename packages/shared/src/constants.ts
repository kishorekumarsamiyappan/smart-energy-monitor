export const DESIGN_TOKENS = {
  colors: {
    primary: '#29378F',
    secondary: '#4054B2',
    lightCard: '#E9EAF8',
    backgroundLight: '#FFFFFF',
    surfaceLight: '#F7F8FD',
    textLight: '#273238',
    mutedTextLight: '#5C6773',
    dividerLight: '#AAB2B5',

    backgroundDark: '#0F1424',
    surfaceDark: '#171E36',
    cardDark: '#1F2847',
    textDark: '#ECEFF4',
    mutedTextDark: '#9BA6C4',
    dividerDark: '#2E3A59',

    success: '#1B9E4B',
    warning: '#F58220',
    error: '#D93025',
    info: '#4054B2',
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', system-ui, -apple-system, sans-serif",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 9999,
  },
} as const;

export const DEFAULT_CURRENT_SENSOR_MODEL = 'SCT-013-000 (100A/50mA + 22Ω Burden)';

export function normalizeCurrentSensorModel(raw?: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || /30\s*A|1\s*V|built-in burden/i.test(s)) {
    return DEFAULT_CURRENT_SENSOR_MODEL;
  }
  return s;
}

export const HARDWARE_SPEC = {
  controller: 'ESP32-S3 DevKit',
  voltageSensor: 'ZMPT101B (GPIO 4, Cal 311.5)',
  currentSensor: 'SCT-013-000 100A/50mA (GPIO 5, 22Ω Burden, Cal 23.202)',
  adc: 'ESP32-S3 Internal 12-bit ADC1 (5 kSPS)',
  phaseSystem: 'Single-phase AC',
  nominalVoltageV: 230,
  nominalFrequencyHz: 50,
  maxCurrentA: 100,
} as const;

export const APP_TIMEZONE = 'Asia/Kolkata';
export const STALE_TELEMETRY_SECONDS = 45;
export const DEFAULT_TELEMETRY_INTERVAL_SECONDS = 10;
export const DEFAULT_MQTT_KEEPALIVE_SECONDS = 20;

export function formatKolkataDateTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return 'Invalid time';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatKolkataTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatKolkataDate(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Compares two semantic version strings (e.g. "1.2.0" vs "1.3.0" or "v1.3.0").
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}
