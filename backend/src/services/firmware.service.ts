import { compareSemver, FirmwareOtaJob, FirmwareReleaseInfo, OtaJobStatus } from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubReleaseResponse {
  tag_name: string;
  name?: string;
  body?: string;
  published_at?: string;
  assets?: GithubAsset[];
}

export class FirmwareService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly githubRepo: string | null,
    private readonly githubToken: string | null = null,
  ) {}

  async listReleases(): Promise<FirmwareReleaseInfo[]> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM firmware_versions ORDER BY released_at DESC`,
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      version: String(r.version),
      tagName: String(r.tag_name || `v${r.version}`),
      githubRepo: r.github_repo ? String(r.github_repo) : null,
      binaryUrl: r.binary_url ? String(r.binary_url) : null,
      checksumSha256: r.checksum_sha256 ? String(r.checksum_sha256) : null,
      releaseNotes: String(r.release_notes || ''),
      fileSizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
      releasedAt: new Date(String(r.released_at)).toISOString(),
    }));
  }

  async syncFromGithub(repoOverride?: string): Promise<FirmwareReleaseInfo> {
    const repo = (repoOverride || this.githubRepo || '').trim();
    if (!repo || !repo.includes('/')) {
      throw new AppError(
        400,
        'GitHub firmware repository (owner/repo) is not configured in GITHUB_FIRMWARE_REPO.',
        'GITHUB_REPO_NOT_CONFIGURED',
      );
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Smart-Energy-Monitor-FOTA',
    };
    if (this.githubToken) {
      headers.Authorization = `Bearer ${this.githubToken}`;
    }

    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
    if (!response.ok) {
      throw new AppError(
        502,
        `GitHub Releases API returned HTTP ${response.status} for ${repo}.`,
        'GITHUB_API_ERROR',
      );
    }

    const release = (await response.json()) as GithubReleaseResponse;
    const binAsset = (release.assets || []).find((a) => a.name.toLowerCase().endsWith('.bin'));
    if (!binAsset) {
      throw new AppError(
        404,
        `Latest GitHub release ${release.tag_name} in ${repo} has no .bin firmware asset.`,
        'FIRMWARE_BINARY_MISSING',
      );
    }

    const cleanVersion = release.tag_name.replace(/^v/i, '');
    const shaMatch = release.body?.match(/\b[a-f0-9]{64}\b/i);
    const sha256 = shaMatch ? shaMatch[0].toLowerCase() : null;

    return this.registerRelease({
      version: cleanVersion,
      tagName: release.tag_name,
      githubRepo: repo,
      binaryUrl: binAsset.browser_download_url,
      checksumSha256: sha256,
      releaseNotes: release.body || release.name || `GitHub Release ${release.tag_name}`,
      fileSizeBytes: binAsset.size,
      releasedAt: release.published_at || new Date().toISOString(),
    });
  }

  async registerRelease(input: {
    version: string;
    tagName?: string;
    githubRepo?: string | null;
    binaryUrl: string;
    checksumSha256?: string | null;
    releaseNotes?: string;
    fileSizeBytes?: number | null;
    releasedAt?: string;
  }): Promise<FirmwareReleaseInfo> {
    const cleanVer = input.version.trim().replace(/^v/i, '');
    const tag = input.tagName || `v${cleanVer}`;
    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO firmware_versions (
        version, tag_name, github_repo, binary_url, checksum_sha256,
        release_notes, file_size_bytes, released_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
      ON CONFLICT (version) DO UPDATE SET
        tag_name = EXCLUDED.tag_name,
        github_repo = COALESCE(EXCLUDED.github_repo, firmware_versions.github_repo),
        binary_url = EXCLUDED.binary_url,
        checksum_sha256 = COALESCE(EXCLUDED.checksum_sha256, firmware_versions.checksum_sha256),
        release_notes = EXCLUDED.release_notes,
        file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, firmware_versions.file_size_bytes),
        released_at = EXCLUDED.released_at
      RETURNING *`,
      [
        cleanVer,
        tag,
        input.githubRepo ?? this.githubRepo,
        input.binaryUrl,
        input.checksumSha256 ?? null,
        input.releaseNotes || `Firmware ${tag}`,
        input.fileSizeBytes ?? null,
        input.releasedAt || new Date().toISOString(),
      ],
    );

    const r = res.rows[0];
    return {
      id: String(r.id),
      version: String(r.version),
      tagName: String(r.tag_name || tag),
      githubRepo: r.github_repo ? String(r.github_repo) : null,
      binaryUrl: r.binary_url ? String(r.binary_url) : null,
      checksumSha256: r.checksum_sha256 ? String(r.checksum_sha256) : null,
      releaseNotes: String(r.release_notes || ''),
      fileSizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
      releasedAt: new Date(String(r.released_at)).toISOString(),
    };
  }

  async getDeviceFirmwareStatus(deviceUuid: string, currentVersion: string) {
    const releases = await this.listReleases();
    const latestWithBin = releases.find((r) => Boolean(r.binaryUrl)) ?? releases[0] ?? null;

    const jobsRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM firmware_ota_jobs WHERE device_uuid = $1 ORDER BY created_at DESC LIMIT 10`,
      [deviceUuid],
    );

    const updateAvailable =
      latestWithBin && latestWithBin.binaryUrl
        ? compareSemver(currentVersion, latestWithBin.version) < 0
        : false;

    return {
      currentVersion,
      githubRepo: this.githubRepo,
      latestRelease: latestWithBin ? { ...latestWithBin, isUpdateAvailable: updateAvailable } : null,
      updateAvailable,
      jobs: jobsRes.rows.map((j) => this.mapJob(j, String(deviceUuid))),
    };
  }

  async triggerOta(input: {
    deviceUuid: string;
    deviceCode: string;
    userId: string;
    targetVersion?: string;
    binaryUrl?: string;
    checksumSha256?: string;
  }): Promise<FirmwareOtaJob> {
    let targetVer = input.targetVersion;
    let binUrl = input.binaryUrl;
    let sha = input.checksumSha256 ?? null;

    if (!binUrl) {
      const releases = await this.listReleases();
      const requestedVer = targetVer?.replace(/^v/i, '');
      const matched = requestedVer
        ? releases.find((r) => r.version === requestedVer)
        : releases.find((r) => Boolean(r.binaryUrl));
      if (!matched || !matched.binaryUrl) {
        throw new AppError(
          400,
          'No downloadable GitHub .bin release URL found. Sync GitHub Releases or provide a binaryUrl.',
          'FIRMWARE_BINARY_MISSING',
        );
      }
      targetVer = matched.version;
      binUrl = matched.binaryUrl;
      sha = matched.checksumSha256;
    }

    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO firmware_ota_jobs (
        device_uuid, requested_by_user_id, target_version, binary_url, checksum_sha256, status, progress_pct
      ) VALUES ($1, $2, $3, $4, $5, 'queued', 0)
      RETURNING *`,
      [input.deviceUuid, input.userId, targetVer || 'latest', binUrl, sha],
    );

    await this.db.query(
      `UPDATE device_status SET ota_status = 'queued', updated_at = NOW() WHERE device_uuid = $1`,
      [input.deviceUuid],
    );

    return this.mapJob(res.rows[0], input.deviceCode);
  }

  async updateJobProgressFromDevice(
    deviceCode: string,
    payload: { jobId?: string; status: OtaJobStatus; progressPct?: number; version?: string; errorMessage?: string },
  ): Promise<void> {
    const devRes = await this.db.query<{ id: string }>(
      `SELECT id FROM devices WHERE UPPER(device_id) = UPPER($1) LIMIT 1`,
      [deviceCode],
    );
    const dev = devRes.rows[0];
    if (!dev) return;

    if (payload.jobId) {
      await this.db.query(
        `UPDATE firmware_ota_jobs
         SET status = $2, progress_pct = COALESCE($3, progress_pct), error_message = COALESCE($4, error_message)
         WHERE id = $1 AND device_uuid = $5`,
        [payload.jobId, payload.status, payload.progressPct ?? null, payload.errorMessage ?? null, dev.id],
      );
    } else {
      await this.db.query(
        `UPDATE firmware_ota_jobs
         SET status = $2, progress_pct = COALESCE($3, progress_pct), error_message = COALESCE($4, error_message)
         WHERE id = (SELECT id FROM firmware_ota_jobs WHERE device_uuid = $1 ORDER BY created_at DESC LIMIT 1)`,
        [dev.id, payload.status, payload.progressPct ?? null, payload.errorMessage ?? null],
      );
    }

    await this.db.query(
      `UPDATE device_status SET ota_status = $2, updated_at = NOW() WHERE device_uuid = $1`,
      [dev.id, payload.status],
    );

    if (payload.status === 'succeeded' && payload.version) {
      await this.db.query(`UPDATE devices SET firmware_version = $2 WHERE id = $1`, [
        dev.id,
        payload.version.replace(/^v/i, ''),
      ]);
    }
  }

  private mapJob(r: Record<string, unknown>, deviceId: string): FirmwareOtaJob {
    return {
      id: String(r.id),
      deviceId,
      targetVersion: String(r.target_version),
      binaryUrl: String(r.binary_url),
      status: String(r.status) as OtaJobStatus,
      progressPct: Number(r.progress_pct ?? 0),
      errorMessage: r.error_message ? String(r.error_message) : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  }
}
