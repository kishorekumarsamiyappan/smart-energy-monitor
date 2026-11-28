'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Cpu,
  DownloadCloud,
  FileBarChart,
  Gauge,
  GitCommitHorizontal,
  Sliders,
  Trash2,
} from 'lucide-react';
import { formatKolkataDateTime, HARDWARE_SPEC, StatusLedMode } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';

type SettingsSection =
  | 'sensor_settings'
  | 'sensor_config'
  | 'io_config'
  | 'mode_settings'
  | 'firmware_fota'
  | 'summary';

export default function DeviceSettingsPage() {
  const params = useParams<{ deviceId: string }>();
  const router = useRouter();
  const { user, isDemoMode, isLoading } = useAuth();
  const {
    devices,
    latestByDevice,
    sensorConfigByDevice,
    ioConfigByDevice,
    firmwareByDevice,
    updateSensorConfig,
    updateIoConfig,
    updateTelemetryInterval,
    triggerFirmwareOta,
    removeDevice,
  } = useData();

  const deviceId = decodeURIComponent(params?.deviceId ?? '');
  const device = devices.find((d) => d.deviceId === deviceId) || devices[0];
  const cfg = device ? sensorConfigByDevice[device.deviceId] : undefined;
  const ioCfg = device ? ioConfigByDevice[device.deviceId] : undefined;
  const fwInfo = device ? firmwareByDevice[device.deviceId] : undefined;
  const latest = device ? latestByDevice[device.deviceId] : null;

  const [activeSection, setActiveSection] = useState<SettingsSection>('sensor_settings');
  const [vCal, setVCal] = useState(String(cfg?.voltageCalibrationFactor ?? 1.0));
  const [iCal, setICal] = useState(String(cfg?.currentCalibrationFactor ?? 1.0));
  const [phaseDeg, setPhaseDeg] = useState(String(cfg?.phaseCorrectionDeg ?? 0.0));
  const [statusLedMode, setStatusLedMode] = useState<StatusLedMode>(ioCfg?.statusLedMode ?? 'inbuilt_rgb');
  const [statusRgbGpio, setStatusRgbGpio] = useState(String(ioCfg?.statusRgbGpio ?? 48));
  const [statusSingleLedGpio, setStatusSingleLedGpio] = useState(String(ioCfg?.statusSingleLedGpio ?? 2));
  const [pulseLedEnabled, setPulseLedEnabled] = useState(ioCfg?.pulseLedEnabled ?? true);
  const [pulseLedGpio, setPulseLedGpio] = useState(String(ioCfg?.pulseLedGpio ?? 21));
  const [pulseImpPerKwh, setPulseImpPerKwh] = useState(String(ioCfg?.pulseImpPerKwh ?? 1000));
  const [offlineBufferEnabled, setOfflineBufferEnabled] = useState(ioCfg?.offlineBufferEnabled ?? true);
  const [otaBusy, setOtaBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user && !isDemoMode) router.replace('/login');
  }, [isDemoMode, isLoading, router, user]);

  useEffect(() => {
    if (cfg) {
      setVCal(String(cfg.voltageCalibrationFactor));
      setICal(String(cfg.currentCalibrationFactor));
      setPhaseDeg(String(cfg.phaseCorrectionDeg));
    }
  }, [cfg]);

  useEffect(() => {
    if (ioCfg) {
      setStatusLedMode(ioCfg.statusLedMode);
      setStatusRgbGpio(String(ioCfg.statusRgbGpio));
      setStatusSingleLedGpio(String(ioCfg.statusSingleLedGpio));
      setPulseLedEnabled(ioCfg.pulseLedEnabled);
      setPulseLedGpio(String(ioCfg.pulseLedGpio));
      setPulseImpPerKwh(String(ioCfg.pulseImpPerKwh));
      setOfflineBufferEnabled(ioCfg.offlineBufferEnabled);
    }
  }, [ioCfg]);

  if (isLoading || (!user && !isDemoMode)) return null;

  const menuItems: Array<{ id: SettingsSection; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = [
    { id: 'sensor_settings', label: 'Sensor Settings', icon: Cpu },
    { id: 'sensor_config', label: 'Sensor Configuration', icon: Sliders },
    { id: 'io_config', label: 'I/O Configuration', icon: GitCommitHorizontal },
    { id: 'mode_settings', label: 'Mode Settings', icon: Gauge },
    { id: 'firmware_fota', label: 'Firmware & GitHub FOTA', icon: DownloadCloud },
    { id: 'summary', label: 'Summary', icon: FileBarChart },
  ];

  const isAdmin = user?.role === 'admin';

  return (
    <AppShell>
      {/* Header matching AVR Device Settings screenshot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/devices" aria-label="Back to devices" style={{ color: 'var(--sem-primary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Device Settings</h1>
          <div style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
            {device ? `${device.name} / ${device.deviceId}` : deviceId}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18 }}>
        {/* AVR-styled divided menu list */}
        <div className="sem-card" style={{ overflow: 'hidden', alignSelf: 'start' }}>
          {menuItems.map((item, idx) => {
            const Icon = item.icon;
            const selected = activeSection === item.id;
            return (
              <React.Fragment key={item.id}>
                {idx > 0 && <hr className="sem-solid-divider" />}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setSavedNotice(null);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    background: selected ? 'var(--sem-lavender)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--sem-text)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, fontSize: 15, fontWeight: 600 }}>
                    <Icon size={22} color="var(--sem-secondary)" />
                    {item.label}
                  </span>
                  <ChevronRight size={20} color="var(--sem-primary)" />
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Detail Panel for Selected Menu Item */}
        <div className="sem-card" style={{ padding: 20 }}>
          {activeSection === 'sensor_settings' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Sensor Settings</h2>
              <p style={{ fontSize: 13, color: 'var(--sem-muted)' }}>
                Verified single-phase hardware frontend attached to {device?.deviceId}.
              </p>
              <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                <div className="sem-lavender-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 700 }}>Voltage Sensor</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{cfg?.voltageSensorModel ?? HARDWARE_SPEC.voltageSensor}</div>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)' }}>230V AC isolated sensing module (GPIO 4 / ADC1_CH3, calibrated)</div>
                </div>
                <div className="sem-lavender-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 700 }}>Current Sensor</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{cfg?.currentSensorModel ?? HARDWARE_SPEC.currentSensor}</div>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)' }}>100A:50mA CT with external 22 Ω burden resistor (GPIO 5 / ADC1_CH4)</div>
                </div>
                <div className="sem-lavender-card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 700 }}>ADC</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{cfg?.adcModel ?? HARDWARE_SPEC.adc}</div>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)' }}>12-bit SAR ADC1 @ 5 kSPS RMS window (GPIO 4 &amp; GPIO 5)</div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'sensor_config' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Sensor Configuration</h2>
              {!isAdmin && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--sem-lavender)', fontSize: 12, marginBottom: 14 }}>
                  Read-only for standard accounts: raw electrical calibration constants are locked to protect measurement accuracy. Contact an administrator for recalibration.
                </div>
              )}
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Voltage Calibration Factor</label>
                  <input className="sem-input" disabled={!isAdmin} value={vCal} onChange={(e) => setVCal(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Current Calibration Factor</label>
                  <input className="sem-input" disabled={!isAdmin} value={iCal} onChange={(e) => setICal(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Phase Correction (deg)</label>
                  <input className="sem-input" disabled={!isAdmin} value={phaseDeg} onChange={(e) => setPhaseDeg(e.target.value)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Nominal Line Frequency:</span>
                  <strong>{cfg?.nominalFrequencyHz ?? 50} Hz</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Calibration Date:</span>
                  <strong>{cfg?.calibrationDate ?? 'Factory baseline'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Calibration Status:</span>
                  <StatusBadge tone={cfg?.calibrationStatus === 'verified' ? 'success' : 'info'} label={cfg?.calibrationStatus ?? 'verified'} />
                </div>
                {savedNotice && <div style={{ color: 'var(--sem-success)', fontSize: 13, fontWeight: 600 }}>{savedNotice}</div>}
                {isAdmin && device && (
                  <button
                    type="button"
                    className="sem-btn sem-btn-primary"
                    onClick={async () => {
                      await updateSensorConfig(device.deviceId, {
                        voltageCalibrationFactor: Number(vCal),
                        currentCalibrationFactor: Number(iCal),
                        phaseCorrectionDeg: Number(phaseDeg),
                        calibrationDate: new Date().toISOString().slice(0, 10),
                        calibrationStatus: 'verified',
                      });
                      setSavedNotice('Calibration parameters updated and audited.');
                    }}
                  >
                    Save Calibration (Admin)
                  </button>
                )}
              </div>
            </div>
          )}

          {activeSection === 'io_config' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>I/O Configuration &amp; LED Indicators</h2>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>ADC1 Channels (GPIO 4 &amp; 5)</span>
                  <StatusBadge tone={cfg?.adcSpiOk !== false ? 'success' : 'error'} label={cfg?.adcSpiOk !== false ? 'ADC1 OK' : 'ADC FAULT'} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>RMS Sampling Window</span>
                  <StatusBadge tone={cfg?.drdyStatusOk !== false ? 'success' : 'error'} label={cfg?.drdyStatusOk !== false ? 'ACTIVE 5 kSPS' : 'TIMEOUT'} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Firmware Version</span>
                  <strong>{device?.firmwareVersion ?? '1.3.1'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Hardware Version</span>
                  <strong>{device?.hardwareVersion ?? 'ESP32-S3-ADC1-REV3'}</strong>
                </div>

                <hr className="sem-dashed-divider" />

                {/* Status LED Selector: Inbuilt RGB vs Single Monochrome LED */}
                <div>
                  <label htmlFor="status-led-mode" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    Device Status LED Mode
                  </label>
                  <select
                    id="status-led-mode"
                    className="sem-input"
                    value={statusLedMode}
                    onChange={(e) => setStatusLedMode(e.target.value as StatusLedMode)}
                  >
                    <option value="inbuilt_rgb">Inbuilt Addressable RGB LED (WS2812 GPIO {statusRgbGpio})</option>
                    <option value="single_gpio">Single Monochrome GPIO LED (GPIO {statusSingleLedGpio})</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--sem-muted)', marginTop: 4 }}>
                    {statusLedMode === 'inbuilt_rgb'
                      ? 'RGB Codes: Green = Online, Amber = Offline Buffering, Blue = BLE Setup, Cyan = FOTA Update, Red = Fault.'
                      : statusLedMode === 'single_gpio'
                        ? 'Single LED Patterns: Solid = Online, Double Blink = Offline Buffering, Fast Blink = BLE/FOTA.'
                        : 'Status LED output muted.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label htmlFor="status-rgb-gpio" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      Inbuilt RGB GPIO
                    </label>
                    <input
                      id="status-rgb-gpio"
                      type="number"
                      min={1}
                      max={48}
                      className="sem-input"
                      value={statusRgbGpio}
                      onChange={(e) => setStatusRgbGpio(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="status-single-gpio" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      Single Status LED GPIO
                    </label>
                    <input
                      id="status-single-gpio"
                      type="number"
                      min={1}
                      max={48}
                      className="sem-input"
                      value={statusSingleLedGpio}
                      onChange={(e) => setStatusSingleLedGpio(e.target.value)}
                    />
                  </div>
                </div>

                {/* External Consumption Indication Pulse LED */}
                <div className="sem-lavender-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pulseLedEnabled}
                      onChange={(e) => setPulseLedEnabled(e.target.checked)}
                    />
                    External Consumption Pulse LED (blink on energy consumption)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label htmlFor="pulse-led-gpio" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                        External Pulse GPIO Pin
                      </label>
                      <input
                        id="pulse-led-gpio"
                        type="number"
                        min={1}
                        max={48}
                        className="sem-input"
                        value={pulseLedGpio}
                        onChange={(e) => setPulseLedGpio(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="pulse-imp-kwh" style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                        Pulse Constant (imp/kWh)
                      </label>
                      <input
                        id="pulse-imp-kwh"
                        type="number"
                        min={100}
                        max={10000}
                        className="sem-input"
                        value={pulseImpPerKwh}
                        onChange={(e) => setPulseImpPerKwh(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Offline Flash Buffer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={offlineBufferEnabled}
                      onChange={(e) => setOfflineBufferEnabled(e.target.checked)}
                    />
                    Local SPIFFS Offline Buffering (syncs when Wi-Fi returns)
                  </label>
                  <StatusBadge
                    tone={(ioCfg?.offlineBufferedCount ?? 0) > 0 ? 'warning' : 'info'}
                    label={`${ioCfg?.offlineBufferedCount ?? 0} Queued`}
                  />
                </div>

                {savedNotice && <div style={{ color: 'var(--sem-success)', fontSize: 13, fontWeight: 600 }}>{savedNotice}</div>}

                {device && (
                  <button
                    type="button"
                    className="sem-btn sem-btn-primary"
                    onClick={async () => {
                      await updateIoConfig(device.deviceId, {
                        statusLedMode,
                        statusRgbGpio: Number(statusRgbGpio),
                        statusSingleLedGpio: Number(statusSingleLedGpio),
                        pulseLedEnabled,
                        pulseLedGpio: Number(pulseLedGpio),
                        pulseImpPerKwh: Number(pulseImpPerKwh),
                        offlineBufferEnabled,
                      });
                      setSavedNotice('I/O, Status LED, and Pulse LED configuration pushed to device.');
                    }}
                  >
                    Save I/O &amp; LED Config
                  </button>
                )}
              </div>
            </div>
          )}

          {activeSection === 'mode_settings' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Mode Settings</h2>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Monitoring Mode</span>
                  <strong>{device?.monitoringMode === 'manual_preferred' ? 'Manual Meter Preferred' : 'Automatic ESP32 Telemetry'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Wi-Fi Status</span>
                  <strong>{device?.isOnline ? `Connected (${device.wifiRssiDbm ?? -55} dBm)` : 'Disconnected'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div>Telemetry Interval</div>
                    <div style={{ fontSize: 11.5, color: 'var(--sem-muted)' }}>
                      Recommended: 10s balance with 20s MQTT Keepalive (~30s power-cut LWT)
                    </div>
                  </div>
                  <select
                    aria-label="Telemetry publish interval"
                    className="sem-input"
                    style={{ width: 'auto', minWidth: 185 }}
                    value={String(device?.telemetryIntervalSec ?? 10)}
                    onChange={async (e) => {
                      if (!device) return;
                      const nextSec = Number(e.target.value);
                      await updateTelemetryInterval(device.deviceId, nextSec);
                      setSavedNotice(`Telemetry interval updated to ${nextSec}s and pushed to ESP32-S3.`);
                    }}
                  >
                    <option value="5">Every 5s (Ultra Fast)</option>
                    <option value="10">Every 10s (Recommended)</option>
                    <option value="15">Every 15s (Balanced)</option>
                    <option value="30">Every 30s (Low Data)</option>
                    <option value="60">Every 60s (Economy)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Power-Cut LWT Detection</span>
                  <strong>20s Keepalive (~30s LWT / 45s Stale)</strong>
                </div>
                {savedNotice && <div style={{ color: 'var(--sem-success)', fontSize: 13, fontWeight: 600 }}>{savedNotice}</div>}
                <hr className="sem-dashed-divider" />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href="/manual-reading" className="sem-btn sem-btn-outline" style={{ fontSize: 13 }}>
                    Enter Manual Meter Reading
                  </Link>
                  <Link href="/alerts" className="sem-btn sem-btn-primary" style={{ fontSize: 13 }}>
                    Configure Alerts
                  </Link>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'firmware_fota' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Firmware &amp; GitHub Releases FOTA</h2>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div className="sem-lavender-card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--sem-muted)', fontWeight: 700 }}>Installed on ESP32-S3</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>v{fwInfo?.currentVersion ?? device?.firmwareVersion ?? '1.2.0'}</div>
                    </div>
                    <StatusBadge
                      tone={fwInfo?.updateAvailable ? 'warning' : 'success'}
                      label={fwInfo?.updateAvailable ? 'UPDATE AVAILABLE' : 'UP TO DATE'}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 6 }}>
                    GitHub Repository: {fwInfo?.githubRepo ?? 'smart-energy-monitor/esp32-s3-firmware'}
                  </div>
                </div>

                {fwInfo?.latestRelease && (
                  <div style={{ padding: 14, border: '1px solid var(--sem-border)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Latest GitHub Release: v{fwInfo.latestRelease.version}</strong>
                      <span style={{ fontSize: 12, color: 'var(--sem-muted)' }}>
                        Tag {fwInfo.latestRelease.tagName ?? `v${fwInfo.latestRelease.version}`}
                      </span>
                    </div>
                    {fwInfo.latestRelease.releaseNotes && (
                      <p style={{ fontSize: 12.5, color: 'var(--sem-muted)', margin: '8px 0' }}>
                        {fwInfo.latestRelease.releaseNotes}
                      </p>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--sem-muted)', wordBreak: 'break-all' }}>
                      Binary URL: {fwInfo.latestRelease.binaryUrl ?? 'Not published'}
                    </div>

                    {device && fwInfo.latestRelease.binaryUrl && (
                      <button
                        type="button"
                        disabled={otaBusy}
                        className="sem-btn sem-btn-primary"
                        style={{ marginTop: 12, width: '100%' }}
                        onClick={async () => {
                          setOtaBusy(true);
                          setSavedNotice(null);
                          try {
                            await triggerFirmwareOta(device.deviceId);
                            setSavedNotice(`Firmware update to v${fwInfo.latestRelease?.version} initiated.`);
                          } finally {
                            setOtaBusy(false);
                          }
                        }}
                      >
                        <DownloadCloud size={16} />
                        {otaBusy
                          ? 'Dispatching OTA...'
                          : fwInfo.updateAvailable
                            ? `Install / Update Firmware (v${fwInfo.latestRelease.version})`
                            : `Reinstall v${fwInfo.latestRelease.version}`}
                      </button>
                    )}
                  </div>
                )}

                {savedNotice && <div style={{ color: 'var(--sem-success)', fontSize: 13, fontWeight: 600 }}>{savedNotice}</div>}

                {(fwInfo?.jobs.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Recent OTA Jobs</div>
                    {fwInfo?.jobs.map((job) => (
                      <div
                        key={job.id}
                        style={{
                          padding: '8px 10px',
                          borderBottom: '1px solid var(--sem-border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 12.5,
                        }}
                      >
                        <span>
                          Target <strong>v{job.targetVersion}</strong> • {job.progressPct}%
                        </span>
                        <StatusBadge
                          tone={
                            job.status === 'succeeded'
                              ? 'success'
                              : job.status === 'failed'
                                ? 'error'
                                : 'info'
                          }
                          label={job.status.toUpperCase()}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'summary' && (
            <div>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Summary</h2>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Device Status</span>
                  <StatusBadge tone={device?.isOnline ? 'success' : 'error'} label={device?.isOnline ? 'Online' : 'Offline'} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Lifetime Total Energy</span>
                  <strong style={{ color: 'var(--sem-primary)' }}>{latest ? `${latest.energyKwh.toFixed(3)} kWh` : '--'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Last Update</span>
                  <strong>{latest?.ingestedAt ? formatKolkataDateTime(latest.ingestedAt) : 'Never'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sensor Health</span>
                  <StatusBadge tone={cfg?.sensorHealthStatus === 'fault' ? 'error' : 'success'} label={(cfg?.sensorHealthStatus ?? 'good').toUpperCase()} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Calibration Status</span>
                  <StatusBadge tone="info" label={cfg?.calibrationStatus ?? 'verified'} />
                </div>
              </div>
              {device && !isDemoMode && (
                <div
                  style={{
                    marginTop: 22,
                    paddingTop: 16,
                    borderTop: '1px solid var(--sem-divider)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sem-error)', marginBottom: 6 }}>
                    Factory Reset &amp; Remove Device
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--sem-muted)', marginTop: 0, marginBottom: 12 }}>
                    Removing this device clears it from your SEM account. To re-pair from scratch, also hold BOOT for 5s or run Factory Reset in the mobile app to wipe Wi-Fi &amp; MQTT credentials from NVS.
                  </p>
                  <button
                    type="button"
                    className="sem-btn sem-btn-outline"
                    style={{ color: 'var(--sem-error)', borderColor: 'var(--sem-error)' }}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Remove "${device.name}" (${device.deviceId}) from your account? You can re-add it cleanly afterwards.`,
                        )
                      ) {
                        return;
                      }
                      await removeDevice(device.deviceId);
                      router.replace('/devices');
                    }}
                  >
                    <Trash2 size={15} />
                    Factory Reset / Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
