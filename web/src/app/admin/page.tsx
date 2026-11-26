'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Users, Cpu, FileSpreadsheet, DownloadCloud } from 'lucide-react';
import { Device, FirmwareReleaseInfo, INDICATIVE_2026_TNEB_LT1A_TARIFF, TariffVersion } from '@sem/shared';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/Primitives';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export default function AdminConsolePage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string; role: string }>>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [tariffs, setTariffs] = useState<TariffVersion[]>([]);
  const [releases, setReleases] = useState<FirmwareReleaseInfo[]>([]);
  const [statusInfo, setStatusInfo] = useState<string | null>(null);
  const [newVersionCode, setNewVersionCode] = useState('TNEB-LT1A-2026-VERIFIED');
  const [newEffectiveFrom, setNewEffectiveFrom] = useState('2026-12-01');
  const [newSourceRef, setNewSourceRef] = useState('TNERC Tariff Order');
  const [githubRepo, setGithubRepo] = useState('owner/smart-energy-monitor-firmware');
  const [fwVersion, setFwVersion] = useState('1.3.0');
  const [fwBinaryUrl, setFwBinaryUrl] = useState('https://github.com/owner/smart-energy-monitor-firmware/releases/download/v1.3.0/smart-energy-monitor.bin');
  const [fwNotes, setFwNotes] = useState('FOTA, offline telemetry buffer, and RTC relay schedules');

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.replace('/dashboard');
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!token || user?.role !== 'admin') return;
    void Promise.all([
      apiRequest<{ users: typeof users }>('/admin/users', { token }),
      apiRequest<{ devices: Device[] }>('/admin/devices', { token }),
      apiRequest<{ tariffs: TariffVersion[] }>('/tariffs/history', { token }),
      apiRequest<{ releases: FirmwareReleaseInfo[] }>('/firmware/releases', { token }),
    ])
      .then(([u, d, t, fw]) => {
        setUsers(u.users);
        setDevices(d.devices);
        setTariffs(t.tariffs);
        setReleases(fw.releases);
      })
      .catch((e) => setStatusInfo(e instanceof Error ? e.message : 'Unable to load admin data'));
  }, [token, user?.role]);

  if (isLoading || !user || user.role !== 'admin') return null;

  const handlePublishTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await apiRequest('/admin/tariffs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          versionCode: newVersionCode,
          category: 'LT-IA',
          effectiveFrom: newEffectiveFrom,
          isIndicative: false,
          officialVerified: true,
          sourceReference: newSourceRef,
          subsidyRule: INDICATIVE_2026_TNEB_LT1A_TARIFF.subsidyRule,
          slabs: INDICATIVE_2026_TNEB_LT1A_TARIFF.slabs,
        }),
      });
      setStatusInfo(`Published new tariff version ${newVersionCode}`);
    } catch (err) {
      setStatusInfo(err instanceof Error ? err.message : 'Failed to create tariff');
    }
  };

  const handleSyncGithub = async () => {
    if (!token) return;
    try {
      const res = await apiRequest<{ release: FirmwareReleaseInfo }>('/admin/firmware/sync-github', {
        method: 'POST',
        token,
        body: JSON.stringify({ repo: githubRepo.trim() }),
      });
      setReleases((prev) => [res.release, ...prev]);
      setStatusInfo(`Synced GitHub release v${res.release.version} from ${githubRepo}`);
    } catch (err) {
      setStatusInfo(err instanceof Error ? err.message : 'Failed to sync GitHub Releases');
    }
  };

  const handleRegisterRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await apiRequest<{ release: FirmwareReleaseInfo }>('/admin/firmware/releases', {
        method: 'POST',
        token,
        body: JSON.stringify({
          version: fwVersion.trim(),
          tagName: `v${fwVersion.trim()}`,
          githubRepo: githubRepo.trim(),
          binaryUrl: fwBinaryUrl.trim(),
          releaseNotes: fwNotes.trim(),
        }),
      });
      setReleases((prev) => [res.release, ...prev]);
      setStatusInfo(`Registered firmware release v${res.release.version}`);
    } catch (err) {
      setStatusInfo(err instanceof Error ? err.message : 'Failed to register firmware release');
    }
  };

  return (
    <AppShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <ShieldCheck size={26} color="#29378F" />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Administrator Console</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--sem-muted)' }}>
            Manage users, device ownership, tariff versions, and platform health
          </p>
        </div>
      </div>

      {statusInfo && (
        <div className="sem-lavender-card" style={{ padding: 12, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          {statusInfo}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="#4054B2" /> Registered Users ({users.length})
          </h2>
          {users.map((u) => (
            <div key={u.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--sem-border)', fontSize: 13 }}>
              <strong>{u.full_name}</strong> ({u.role}) — {u.email}
            </div>
          ))}
        </div>

        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={18} color="#4054B2" /> Fleet Devices ({devices.length})
          </h2>
          {devices.map((d) => (
            <div key={d.deviceId} style={{ padding: '8px 0', borderBottom: '1px solid var(--sem-border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{d.name}</strong> ({d.deviceId})</span>
              <StatusBadge tone={d.isOnline ? 'success' : 'error'} label={d.isOnline ? 'Online' : 'Offline'} />
            </div>
          ))}
        </div>

        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={18} color="#4054B2" /> Tariff Versions ({tariffs.length})
          </h2>
          {tariffs.map((t) => (
            <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--sem-border)', fontSize: 13 }}>
              <strong>{t.versionCode}</strong> • Eff: {t.effectiveFrom} • {t.officialVerified ? 'Verified' : 'Indicative'}
            </div>
          ))}
          <form onSubmit={handlePublishTariff} style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <input className="sem-input" value={newVersionCode} onChange={(e) => setNewVersionCode(e.target.value)} placeholder="Tariff Version Code" required />
            <input type="date" className="sem-input" value={newEffectiveFrom} onChange={(e) => setNewEffectiveFrom(e.target.value)} required />
            <input className="sem-input" value={newSourceRef} onChange={(e) => setNewSourceRef(e.target.value)} placeholder="TNERC Order Reference" required />
            <button type="submit" className="sem-btn sem-btn-primary">Publish Verified Tariff Version</button>
          </form>
        </div>

        <div className="sem-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DownloadCloud size={18} color="#4054B2" /> GitHub Firmware Releases ({releases.length})
          </h2>
          {releases.slice(0, 5).map((rel) => (
            <div key={rel.version} style={{ padding: '8px 0', borderBottom: '1px solid var(--sem-border)', fontSize: 13 }}>
              <strong>v{rel.version}</strong> • {rel.githubRepo ?? 'Manual Release'}
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <input
              className="sem-input"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="GitHub owner/repo"
            />
            <button type="button" className="sem-btn sem-btn-outline" onClick={() => void handleSyncGithub()}>
              Sync Latest Release from GitHub
            </button>
          </div>
          <form onSubmit={handleRegisterRelease} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <input className="sem-input" value={fwVersion} onChange={(e) => setFwVersion(e.target.value)} placeholder="Firmware Version (e.g. 1.3.0)" required />
            <input className="sem-input" value={fwBinaryUrl} onChange={(e) => setFwBinaryUrl(e.target.value)} placeholder="GitHub .bin Release URL" required />
            <input className="sem-input" value={fwNotes} onChange={(e) => setFwNotes(e.target.value)} placeholder="Release notes" />
            <button type="submit" className="sem-btn sem-btn-primary">Publish FOTA Binary Release</button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
