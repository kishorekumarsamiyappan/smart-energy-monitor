'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  AlertEvent,
  AlertRule,
  BillingCycleRecord,
  calculateTnebBill,
  createDemoDevices,
  createDemoRelays,
  DEMO_IO_CONFIG,
  DEMO_LATEST_FIRMWARE,
  DEMO_SENSOR_CONFIG,
  Device,
  DeviceIoConfig,
  DeviceRelay,
  DeviceSensorConfig,
  FirmwareOtaJob,
  FirmwareReleaseInfo,
  generateDemoAlerts,
  generateDemoBillingEstimate,
  generateDemoTelemetrySeries,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
  ManualReadingRecord,
  RelaySchedule,
  TariffVersion,
  TelemetryPoint,
} from '@sem/shared';
import { useAuth } from './auth-context';
import { apiRequest } from './api-client';

interface DataContextValue {
  devices: Device[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string) => void;
  latestByDevice: Record<string, TelemetryPoint | null>;
  historyByDevice: Record<string, TelemetryPoint[]>;
  sensorConfigByDevice: Record<string, DeviceSensorConfig>;
  ioConfigByDevice: Record<string, DeviceIoConfig>;
  relaysByDevice: Record<string, DeviceRelay[]>;
  firmwareByDevice: Record<
    string,
    {
      currentVersion: string;
      githubRepo: string | null;
      latestRelease: FirmwareReleaseInfo | null;
      updateAvailable: boolean;
      jobs: FirmwareOtaJob[];
    }
  >;
  billingCycles: BillingCycleRecord[];
  manualReadings: ManualReadingRecord[];
  alerts: AlertEvent[];
  alertRules: AlertRule[];
  activeTariff: TariffVersion;
  isLoadingData: boolean;
  dataError: string | null;
  refreshAll: (opts?: { silent?: boolean }) => Promise<void>;
  loadDeviceHistory: (deviceId: string, rangeDays: number, startDate?: string, endDate?: string) => Promise<TelemetryPoint[]>;
  addDevice: (input: {
    deviceId: string;
    name: string;
    locationLabel?: string;
    consumerEligibleForSubsidy: boolean;
    meterSerialNumber?: string;
  }) => Promise<Device>;
  renameDevice: (deviceId: string, name: string) => Promise<void>;
  updateTelemetryInterval: (deviceId: string, telemetryIntervalSec: number) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  updateSensorConfig: (deviceId: string, patch: Partial<DeviceSensorConfig>) => Promise<void>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
  saveAlertRule: (rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  saveBillingEstimate: (input: {
    deviceId: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: 'automatic_esp32' | 'manual_eb_meter';
    consumerEligible: boolean;
  }) => Promise<BillingCycleRecord>;
  submitManualReading: (input: {
    deviceId: string;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    notes?: string;
    preferredSource?: 'automatic_esp32' | 'manual_eb_meter';
  }) => Promise<ManualReadingRecord>;
  recordActualBill: (cycleId: string, actualAmountInr: number) => Promise<void>;
  updateIoConfig: (deviceId: string, patch: Partial<Omit<DeviceIoConfig, 'deviceId' | 'offlineBufferedCount'>>) => Promise<void>;
  toggleRelay: (deviceId: string, relayId: string, nextState: boolean) => Promise<void>;
  addRelay: (deviceId: string, input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean }) => Promise<void>;
  deleteRelay: (deviceId: string, relayId: string) => Promise<void>;
  addRelaySchedule: (deviceId: string, relayId: string, input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean }) => Promise<void>;
  toggleRelaySchedule: (deviceId: string, relayId: string, scheduleId: string, enabled: boolean) => Promise<void>;
  deleteRelaySchedule: (deviceId: string, relayId: string, scheduleId: string) => Promise<void>;
  triggerFirmwareOta: (deviceId: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, token, isDemoMode } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [latestByDevice, setLatestByDevice] = useState<Record<string, TelemetryPoint | null>>({});
  const [historyByDevice, setHistoryByDevice] = useState<Record<string, TelemetryPoint[]>>({});
  const [sensorConfigByDevice, setSensorConfigByDevice] = useState<Record<string, DeviceSensorConfig>>({});
  const [ioConfigByDevice, setIoConfigByDevice] = useState<Record<string, DeviceIoConfig>>({});
  const [relaysByDevice, setRelaysByDevice] = useState<Record<string, DeviceRelay[]>>({});
  const [firmwareByDevice, setFirmwareByDevice] = useState<
    Record<
      string,
      {
        currentVersion: string;
        githubRepo: string | null;
        latestRelease: FirmwareReleaseInfo | null;
        updateAvailable: boolean;
        jobs: FirmwareOtaJob[];
      }
    >
  >({});
  const [billingCycles, setBillingCycles] = useState<BillingCycleRecord[]>([]);
  const [manualReadings, setManualReadings] = useState<ManualReadingRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [activeTariff, setActiveTariff] = useState<TariffVersion>(INDICATIVE_2026_TNEB_LT1A_TARIFF);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadDemoData = useCallback(() => {
    const demoDevs = createDemoDevices();
    const latestMap: Record<string, TelemetryPoint | null> = {};
    const histMap: Record<string, TelemetryPoint[]> = {};
    const allCycles: BillingCycleRecord[] = [];

    for (const dev of demoDevs) {
      const pts = generateDemoTelemetrySeries(dev.deviceId, 1);
      histMap[dev.deviceId] = pts;
      latestMap[dev.deviceId] = pts[pts.length - 1] ?? null;
      const b = generateDemoBillingEstimate(dev.deviceId);
      allCycles.push(...b.history);
    }

    setDevices(demoDevs);
    setSelectedDeviceId((prev) => prev && demoDevs.some((d) => d.deviceId === prev) ? prev : demoDevs[0].deviceId);
    setLatestByDevice(latestMap);
    setHistoryByDevice(histMap);
    setSensorConfigByDevice({ ...DEMO_SENSOR_CONFIG });
    setIoConfigByDevice({ ...DEMO_IO_CONFIG });
    setRelaysByDevice(createDemoRelays());
    setFirmwareByDevice({
      'DEMO-SEM-001': {
        currentVersion: '1.2.0-demo',
        githubRepo: DEMO_LATEST_FIRMWARE.githubRepo,
        latestRelease: DEMO_LATEST_FIRMWARE,
        updateAvailable: true,
        jobs: [],
      },
      'DEMO-SEM-002': {
        currentVersion: '1.2.0-demo',
        githubRepo: DEMO_LATEST_FIRMWARE.githubRepo,
        latestRelease: DEMO_LATEST_FIRMWARE,
        updateAvailable: true,
        jobs: [],
      },
    });
    setBillingCycles(allCycles);
    setManualReadings([
      {
        id: 'demo-mr-1',
        deviceId: 'DEMO-SEM-001',
        userId: 'demo-user-001',
        previousReading: 1320,
        previousReadingDate: '2026-10-01',
        currentReading: 1682,
        currentReadingDate: '2026-11-25',
        unitsConsumed: 362,
        meterSerialNumber: 'TN-EB-884210',
        notes: 'Verified visually from ground-floor static meter',
        automaticComparisonKwh: 365.4,
        discrepancyKwh: 3.4,
        discrepancyPercent: 0.94,
        selectedForEstimate: false,
        createdAt: '2026-11-25T08:00:00.000Z',
      },
    ]);
    setAlerts(generateDemoAlerts());
    setAlertRules([
      {
        id: 'demo-rule-1',
        deviceId: 'DEMO-SEM-001',
        userId: 'demo-user-001',
        alertType: 'high_power',
        thresholdValue: 2500,
        comparisonOperator: 'gt',
        severity: 'warning',
        enabled: true,
        pushEnabled: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'demo-rule-2',
        deviceId: 'DEMO-SEM-001',
        userId: 'demo-user-001',
        alertType: 'abnormal_voltage',
        thresholdValue: 205,
        secondaryThreshold: 252,
        comparisonOperator: 'outside_range',
        severity: 'critical',
        enabled: true,
        pushEnabled: true,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    setActiveTariff(INDICATIVE_2026_TNEB_LT1A_TARIFF);
    setDataError(null);
  }, []);

  const refreshAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (isDemoMode) {
      loadDemoData();
      return;
    }
    if (!user || !token) {
      setDevices([]);
      setLatestByDevice({});
      setHistoryByDevice({});
      setBillingCycles([]);
      setAlerts([]);
      return;
    }

    if (!opts?.silent) {
      setIsLoadingData(true);
    }
    setDataError(null);
    try {
      const [devRes, billRes, tariffRes, alertsRes] = await Promise.all([
        apiRequest<{ devices: Device[] }>('/devices', { token }),
        apiRequest<{ cycles: BillingCycleRecord[]; manualReadings?: ManualReadingRecord[] }>('/billing/history', { token }),
        apiRequest<{ tariff: TariffVersion }>('/tariffs/current', { token }),
        apiRequest<{ alerts: AlertEvent[]; rules?: AlertRule[] }>('/alerts', { token }),
      ]);

      setDevices(devRes.devices);
      setBillingCycles(billRes.cycles);
      if (billRes.manualReadings) setManualReadings(billRes.manualReadings);
      if (tariffRes.tariff) setActiveTariff(tariffRes.tariff);
      setAlerts(alertsRes.alerts);
      if (alertsRes.rules) setAlertRules(alertsRes.rules);

      if (devRes.devices.length > 0) {
        const firstId = devRes.devices[0].deviceId;
        setSelectedDeviceId((prev) =>
          prev && devRes.devices.some((d) => d.deviceId === prev) ? prev : firstId,
        );

        const latestEntries = await Promise.all(
          devRes.devices.map(async (d) => {
            try {
              const [latRes, ioRes, relRes, fwRes] = await Promise.all([
                apiRequest<{ latest: TelemetryPoint | null; sensorConfig?: DeviceSensorConfig }>(
                  `/devices/${d.deviceId}/latest`,
                  { token },
                ),
                apiRequest<{ ioConfig: DeviceIoConfig }>(`/devices/${d.deviceId}/io-config`, { token }).catch(() => null),
                apiRequest<{ relays: DeviceRelay[] }>(`/devices/${d.deviceId}/relays`, { token }).catch(() => null),
                apiRequest<{
                  currentVersion: string;
                  githubRepo: string | null;
                  latestRelease: FirmwareReleaseInfo | null;
                  updateAvailable: boolean;
                  jobs: FirmwareOtaJob[];
                }>(`/devices/${d.deviceId}/firmware`, { token }).catch(() => null),
              ]);
              return [d.deviceId, latRes.latest, latRes.sensorConfig, ioRes?.ioConfig, relRes?.relays, fwRes] as const;
            } catch {
              return [d.deviceId, null, undefined, undefined, undefined, undefined] as const;
            }
          }),
        );

        const nextLatest: Record<string, TelemetryPoint | null> = {};
        const nextConfig: Record<string, DeviceSensorConfig> = {};
        const nextIo: Record<string, DeviceIoConfig> = {};
        const nextRelays: Record<string, DeviceRelay[]> = {};
        const nextFw: typeof firmwareByDevice = {};
        for (const [id, pt, cfg, ioCfg, relays, fw] of latestEntries) {
          nextLatest[id] = pt;
          if (cfg) nextConfig[id] = cfg;
          if (ioCfg) nextIo[id] = ioCfg;
          if (relays) nextRelays[id] = relays;
          if (fw) nextFw[id] = fw;
        }
        setLatestByDevice(nextLatest);
        setSensorConfigByDevice((prev) => ({ ...prev, ...nextConfig }));
        setIoConfigByDevice((prev) => ({ ...prev, ...nextIo }));
        setRelaysByDevice((prev) => ({ ...prev, ...nextRelays }));
        setFirmwareByDevice((prev) => ({ ...prev, ...nextFw }));
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to fetch data from backend');
    } finally {
      setIsLoadingData(false);
    }
  }, [isDemoMode, loadDemoData, token, user]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (isDemoMode || !user || !token) return;
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refreshAll({ silent: true });
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isDemoMode, refreshAll, token, user]);

  const loadDeviceHistory = useCallback(
    async (deviceId: string, rangeDays: number, startDate?: string, endDate?: string) => {
      if (isDemoMode) {
        const pts = generateDemoTelemetrySeries(deviceId, rangeDays);
        setHistoryByDevice((prev) => ({ ...prev, [deviceId]: pts }));
        return pts;
      }
      if (!token) return [];
      const params = new URLSearchParams({ days: String(rangeDays) });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await apiRequest<{ points: TelemetryPoint[] }>(
        `/devices/${deviceId}/history?${params.toString()}`,
        { token },
      );
      setHistoryByDevice((prev) => ({ ...prev, [deviceId]: res.points }));
      return res.points;
    },
    [isDemoMode, token],
  );

  const addDevice = async (input: {
    deviceId: string;
    name: string;
    locationLabel?: string;
    consumerEligibleForSubsidy: boolean;
    meterSerialNumber?: string;
  }): Promise<Device> => {
    if (isDemoMode) {
      const now = new Date().toISOString();
      const newDev: Device = {
        id: `demo-dev-${Date.now()}`,
        deviceId: input.deviceId.toUpperCase(),
        ownerUserId: 'demo-user-001',
        name: input.name,
        locationLabel: input.locationLabel || 'Demo Panel',
        serviceCategory: 'LT-IA',
        consumerEligibleForSubsidy: input.consumerEligibleForSubsidy,
        meterSerialNumber: input.meterSerialNumber || null,
        firmwareVersion: '1.3.1-demo',
        hardwareVersion: 'ESP32-S3-ADC1-REV3',
        telemetryIntervalSec: 10,
        monitoringMode: 'automatic',
        isOnline: true,
        wifiRssiDbm: -58,
        lastSeenAt: now,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      };
      const pts = generateDemoTelemetrySeries(newDev.deviceId, 1);
      setDevices((prev) => [...prev, newDev]);
      setHistoryByDevice((prev) => ({ ...prev, [newDev.deviceId]: pts }));
      setLatestByDevice((prev) => ({ ...prev, [newDev.deviceId]: pts[pts.length - 1] ?? null }));
      setSensorConfigByDevice((prev) => ({
        ...prev,
        [newDev.deviceId]: { ...DEMO_SENSOR_CONFIG['DEMO-SEM-001'], deviceId: newDev.deviceId },
      }));
      setSelectedDeviceId(newDev.deviceId);
      return newDev;
    }

    const res = await apiRequest<{ device: Device }>('/devices', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
    await refreshAll();
    setSelectedDeviceId(res.device.deviceId);
    return res.device;
  };

  const renameDevice = async (deviceId: string, name: string) => {
    if (isDemoMode) {
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? { ...d, name } : d)));
      return;
    }
    await apiRequest(`/devices/${deviceId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ name }),
    });
    await refreshAll();
  };

  const updateTelemetryInterval = async (deviceId: string, telemetryIntervalSec: number) => {
    const cleanSec = Math.max(5, Math.min(3600, Math.round(telemetryIntervalSec)));
    if (isDemoMode) {
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === deviceId ? { ...d, telemetryIntervalSec: cleanSec } : d)),
      );
      return;
    }
    await apiRequest(`/devices/${deviceId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ telemetryIntervalSec: cleanSec }),
    });
    await refreshAll({ silent: true });
  };

  const removeDevice = async (deviceId: string) => {
    if (isDemoMode) {
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      return;
    }
    await apiRequest(`/devices/${deviceId}`, {
      method: 'DELETE',
      token,
    });
    await refreshAll();
  };

  const updateSensorConfig = async (deviceId: string, patch: Partial<DeviceSensorConfig>) => {
    if (isDemoMode) {
      setSensorConfigByDevice((prev) => ({
        ...prev,
        [deviceId]: { ...(prev[deviceId] ?? DEMO_SENSOR_CONFIG['DEMO-SEM-001']), ...patch },
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ sensorConfig: patch }),
    });
    await refreshAll();
  };

  const acknowledgeAlert = async (alertId: string) => {
    if (isDemoMode) {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }
            : a,
        ),
      );
      return;
    }
    await apiRequest(`/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      token,
    });
    await refreshAll();
  };

  const saveAlertRule = async (rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>) => {
    if (isDemoMode) {
      const created: AlertRule = {
        ...rule,
        id: `demo-rule-${Date.now()}`,
        userId: 'demo-user-001',
        createdAt: new Date().toISOString(),
      };
      setAlertRules((prev) => [created, ...prev]);
      return;
    }
    await apiRequest('/alerts/rules', {
      method: 'POST',
      token,
      body: JSON.stringify(rule),
    });
    await refreshAll();
  };

  const saveBillingEstimate = async (input: {
    deviceId: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: 'automatic_esp32' | 'manual_eb_meter';
    consumerEligible: boolean;
  }): Promise<BillingCycleRecord> => {
    if (isDemoMode) {
      const calc = calculateTnebBill({
        deviceId: input.deviceId,
        serviceCategory: 'LT-IA',
        consumerEligible: input.consumerEligible,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        previousReadingDate: input.previousReadingDate,
        currentReadingDate: input.currentReadingDate,
        readingSource: input.readingSource,
        tariffVersion: activeTariff,
      });
      const rec: BillingCycleRecord = {
        id: `demo-bill-${Date.now()}`,
        deviceId: input.deviceId,
        userId: 'demo-user-001',
        periodStart: input.previousReadingDate,
        periodEnd: input.currentReadingDate,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        unitsConsumed: calc.unitsConsumed,
        readingSource: calc.readingSource,
        estimatedAmountInr: calc.totalEstimatedAmountInr,
        actualBillAmountInr: null,
        varianceAmountInr: null,
        tariffVersionCode: activeTariff.versionCode,
        status: 'estimated',
        calculationPayload: calc,
        createdAt: new Date().toISOString(),
      };
      setBillingCycles((prev) => [rec, ...prev]);
      return rec;
    }

    const res = await apiRequest<{ cycle?: BillingCycleRecord; billingCycle?: BillingCycleRecord }>('/billing/calculate', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
    await refreshAll({ silent: true });
    return (res.cycle ?? res.billingCycle)!;
  };

  const submitManualReading = async (input: {
    deviceId: string;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    notes?: string;
    preferredSource?: 'automatic_esp32' | 'manual_eb_meter';
  }): Promise<ManualReadingRecord> => {
    if (isDemoMode) {
      const units = Math.max(0, input.currentReading - input.previousReading);
      const latest = latestByDevice[input.deviceId];
      const autoUnits = latest ? Math.max(0, latest.energyKwh - 1320) : units;
      const diff = Math.round(Math.abs(units - autoUnits) * 100) / 100;
      const pct = units > 0 ? Math.round((diff / units) * 10000) / 100 : 0;

      const rec: ManualReadingRecord = {
        id: `demo-mr-${Date.now()}`,
        deviceId: input.deviceId,
        userId: 'demo-user-001',
        previousReading: input.previousReading,
        previousReadingDate: input.previousReadingDate,
        currentReading: input.currentReading,
        currentReadingDate: input.currentReadingDate,
        unitsConsumed: units,
        meterSerialNumber: input.meterSerialNumber || null,
        notes: input.notes || null,
        automaticComparisonKwh: autoUnits,
        discrepancyKwh: diff,
        discrepancyPercent: pct,
        selectedForEstimate: input.preferredSource === 'manual_eb_meter',
        createdAt: new Date().toISOString(),
      };
      setManualReadings((prev) => [rec, ...prev]);

      const calc = calculateTnebBill({
        deviceId: input.deviceId,
        serviceCategory: 'LT-IA',
        consumerEligible: true,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        previousReadingDate: input.previousReadingDate,
        currentReadingDate: input.currentReadingDate,
        readingSource: input.preferredSource || 'manual_eb_meter',
        tariffVersion: activeTariff,
      });

      setBillingCycles((prev) => [
        {
          id: `demo-bill-${Date.now()}`,
          deviceId: input.deviceId,
          userId: 'demo-user-001',
          periodStart: input.previousReadingDate,
          periodEnd: input.currentReadingDate,
          previousReading: input.previousReading,
          currentReading: input.currentReading,
          unitsConsumed: calc.unitsConsumed,
          readingSource: calc.readingSource,
          estimatedAmountInr: calc.totalEstimatedAmountInr,
          actualBillAmountInr: null,
          varianceAmountInr: null,
          tariffVersionCode: activeTariff.versionCode,
          status: 'estimated',
          calculationPayload: calc,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      return rec;
    }

    const res = await apiRequest<{ reading: ManualReadingRecord }>('/billing/manual-reading', {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
    await refreshAll();
    return res.reading;
  };

  const recordActualBill = async (cycleId: string, actualAmountInr: number) => {
    if (isDemoMode) {
      setBillingCycles((prev) =>
        prev.map((c) =>
          c.id === cycleId
            ? {
                ...c,
                actualBillAmountInr: actualAmountInr,
                varianceAmountInr: Math.round((actualAmountInr - c.estimatedAmountInr) * 100) / 100,
                status: 'billed',
              }
            : c,
        ),
      );
      return;
    }
    await apiRequest(`/billing/${cycleId}/actual`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ actualBillAmountInr: actualAmountInr }),
    });
    await refreshAll();
  };

  const updateIoConfig = async (
    deviceId: string,
    patch: Partial<Omit<DeviceIoConfig, 'deviceId' | 'offlineBufferedCount'>>,
  ) => {
    if (isDemoMode) {
      setIoConfigByDevice((prev) => ({
        ...prev,
        [deviceId]: { ...(prev[deviceId] ?? DEMO_IO_CONFIG['DEMO-SEM-001']), ...patch, deviceId },
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/io-config`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    });
    await refreshAll();
  };

  const toggleRelay = async (deviceId: string, relayId: string, nextState: boolean) => {
    if (isDemoMode) {
      setRelaysByDevice((prev) => ({
        ...prev,
        [deviceId]: (prev[deviceId] ?? []).map((r) =>
          r.id === relayId ? { ...r, currentState: nextState, updatedAt: new Date().toISOString() } : r,
        ),
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays/${relayId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ currentState: nextState }),
    });
    await refreshAll();
  };

  const addRelay = async (
    deviceId: string,
    input: { name: string; gpioPin: number; activeHigh: boolean; failSafeState: boolean },
  ) => {
    if (isDemoMode) {
      setRelaysByDevice((prev) => {
        const list = prev[deviceId] ?? [];
        const nextCh = list.length > 0 ? Math.max(...list.map((r) => r.channelIndex)) + 1 : 1;
        const created: DeviceRelay = {
          id: `demo-relay-${Date.now()}`,
          deviceId,
          channelIndex: nextCh,
          name: input.name,
          gpioPin: input.gpioPin,
          activeHigh: input.activeHigh,
          currentState: input.failSafeState,
          failSafeState: input.failSafeState,
          isConfirmedDefault: false,
          schedules: [],
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, [deviceId]: [...list, created] };
      });
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays`, {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
    await refreshAll();
  };

  const deleteRelay = async (deviceId: string, relayId: string) => {
    if (isDemoMode) {
      setRelaysByDevice((prev) => ({
        ...prev,
        [deviceId]: (prev[deviceId] ?? []).filter((r) => r.id !== relayId),
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays/${relayId}`, { method: 'DELETE', token });
    await refreshAll();
  };

  const addRelaySchedule = async (
    deviceId: string,
    relayId: string,
    input: { label: string; startTimeIst: string; stopTimeIst: string; daysOfWeek: number[]; enabled: boolean },
  ) => {
    if (isDemoMode) {
      const sched: RelaySchedule = {
        id: `demo-sched-${Date.now()}`,
        relayId,
        deviceId,
        label: input.label,
        startTimeIst: input.startTimeIst,
        stopTimeIst: input.stopTimeIst,
        daysOfWeek: input.daysOfWeek,
        enabled: input.enabled,
        timezone: 'Asia/Kolkata',
        createdAt: new Date().toISOString(),
      };
      setRelaysByDevice((prev) => ({
        ...prev,
        [deviceId]: (prev[deviceId] ?? []).map((r) =>
          r.id === relayId ? { ...r, schedules: [...r.schedules, sched] } : r,
        ),
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays/${relayId}/schedules`, {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    });
    await refreshAll();
  };

  const toggleRelaySchedule = async (
    deviceId: string,
    relayId: string,
    scheduleId: string,
    enabled: boolean,
  ) => {
    if (isDemoMode) {
      setRelaysByDevice((prev) => ({
        ...prev,
        [deviceId]: (prev[deviceId] ?? []).map((r) =>
          r.id === relayId
            ? {
                ...r,
                schedules: r.schedules.map((s) => (s.id === scheduleId ? { ...s, enabled } : s)),
              }
            : r,
        ),
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays/${relayId}/schedules/${scheduleId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ enabled }),
    });
    await refreshAll();
  };

  const deleteRelaySchedule = async (deviceId: string, relayId: string, scheduleId: string) => {
    if (isDemoMode) {
      setRelaysByDevice((prev) => ({
        ...prev,
        [deviceId]: (prev[deviceId] ?? []).map((r) =>
          r.id === relayId ? { ...r, schedules: r.schedules.filter((s) => s.id !== scheduleId) } : r,
        ),
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/relays/${relayId}/schedules/${scheduleId}`, {
      method: 'DELETE',
      token,
    });
    await refreshAll();
  };

  const triggerFirmwareOta = async (deviceId: string) => {
    if (isDemoMode) {
      const fw = firmwareByDevice[deviceId];
      const targetVer = fw?.latestRelease?.version ?? '1.3.0';
      const job: FirmwareOtaJob = {
        id: `demo-ota-${Date.now()}`,
        deviceId,
        targetVersion: targetVer,
        binaryUrl: fw?.latestRelease?.binaryUrl ?? DEMO_LATEST_FIRMWARE.binaryUrl!,
        status: 'succeeded',
        progressPct: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDevices((prev) => prev.map((d) => (d.deviceId === deviceId ? { ...d, firmwareVersion: targetVer } : d)));
      setFirmwareByDevice((prev) => ({
        ...prev,
        [deviceId]: {
          currentVersion: targetVer,
          githubRepo: fw?.githubRepo ?? DEMO_LATEST_FIRMWARE.githubRepo,
          latestRelease: fw?.latestRelease ? { ...fw.latestRelease, isUpdateAvailable: false } : null,
          updateAvailable: false,
          jobs: [job, ...(fw?.jobs ?? [])],
        },
      }));
      return;
    }
    await apiRequest(`/devices/${deviceId}/ota`, { method: 'POST', token, body: JSON.stringify({}) });
    await refreshAll();
  };

  return (
    <DataContext.Provider
      value={{
        devices,
        selectedDeviceId,
        setSelectedDeviceId,
        latestByDevice,
        historyByDevice,
        sensorConfigByDevice,
        ioConfigByDevice,
        relaysByDevice,
        firmwareByDevice,
        billingCycles,
        manualReadings,
        alerts,
        alertRules,
        activeTariff,
        isLoadingData,
        dataError,
        refreshAll,
        loadDeviceHistory,
        addDevice,
        renameDevice,
        updateTelemetryInterval,
        removeDevice,
        updateSensorConfig,
        acknowledgeAlert,
        saveAlertRule,
        saveBillingEstimate,
        submitManualReading,
        recordActualBill,
        updateIoConfig,
        toggleRelay,
        addRelay,
        deleteRelay,
        addRelaySchedule,
        toggleRelaySchedule,
        deleteRelaySchedule,
        triggerFirmwareOta,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
