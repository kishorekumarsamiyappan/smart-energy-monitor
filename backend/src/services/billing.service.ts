import {
  BillCalculationResult,
  BillingCycleRecord,
  calculateTnebBill,
  compareReadingSources,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
  ManualReadingRecord,
  ReadingSource,
  TariffSlab,
  TariffVersion,
} from '@sem/shared';
import { DatabaseClient } from '../db/database.js';
import { AppError } from '../middleware/error-handler.js';

export class BillingService {
  constructor(private readonly db: DatabaseClient) {}

  async getActiveTariff(asOfDate?: string): Promise<TariffVersion> {
    const targetDate = asOfDate || new Date().toISOString().slice(0, 10);
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM tariff_versions
       WHERE status = 'active'
         AND effective_from <= $1::date
         AND (effective_to IS NULL OR effective_to >= $1::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [targetDate],
    );
    const row = res.rows[0];
    if (!row) {
      return INDICATIVE_2026_TNEB_LT1A_TARIFF;
    }
    return this.hydrateTariff(row);
  }

  async getAllTariffs(): Promise<TariffVersion[]> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM tariff_versions ORDER BY effective_from DESC`,
    );
    return Promise.all(res.rows.map((r) => this.hydrateTariff(r)));
  }

  async createTariff(
    adminUserId: string,
    input: {
      versionCode: string;
      category: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      isIndicative: boolean;
      officialVerified: boolean;
      sourceReference: string;
      slabs: TariffSlab[];
      subsidyRule: {
        name: string;
        freeUnitsUpto500: number;
        freeUnitsAbove500: number;
        eligibilityRequired: boolean;
        notes: string;
      };
    },
  ): Promise<TariffVersion> {
    const res = await this.db.query<Record<string, unknown>>(
      `INSERT INTO tariff_versions (
        version_code, category, effective_from, effective_to, status,
        is_indicative, official_verified, source_reference, approved_by_user_id, approved_at
      ) VALUES ($1, $2, $3::date, $4::date, 'active', $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        input.versionCode.trim(),
        input.category || 'LT-IA',
        input.effectiveFrom,
        input.effectiveTo || null,
        input.isIndicative,
        input.officialVerified,
        input.sourceReference.trim(),
        adminUserId,
      ],
    );
    const tv = res.rows[0];
    await this.db.query(
      `INSERT INTO subsidy_rules (tariff_version_id, name, free_units_upto_500, free_units_above_500, eligibility_required, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tv.id,
        input.subsidyRule.name,
        input.subsidyRule.freeUnitsUpto500,
        input.subsidyRule.freeUnitsAbove500,
        input.subsidyRule.eligibilityRequired,
        input.subsidyRule.notes,
      ],
    );

    for (const slab of input.slabs) {
      await this.db.query(
        `INSERT INTO tariff_slabs (tariff_version_id, slab_order, branch, from_unit, to_unit, rate_per_unit_inr, fixed_charge_inr, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tv.id,
          slab.slabOrder,
          slab.branch,
          slab.fromUnit,
          slab.toUnit,
          slab.ratePerUnitInr,
          slab.fixedChargeInr,
          slab.description,
        ],
      );
    }

    return this.hydrateTariff(tv);
  }

  async updateTariffStatus(
    adminUserId: string,
    tariffId: string,
    patch: { status?: 'draft' | 'active' | 'archived'; officialVerified?: boolean; isIndicative?: boolean },
  ): Promise<TariffVersion> {
    const res = await this.db.query<Record<string, unknown>>(
      `UPDATE tariff_versions
       SET status = COALESCE($2, status),
           official_verified = COALESCE($3, official_verified),
           is_indicative = COALESCE($4, is_indicative),
           approved_by_user_id = $5,
           approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [tariffId, patch.status ?? null, patch.officialVerified ?? null, patch.isIndicative ?? null, adminUserId],
    );
    if (!res.rows[0]) {
      throw new AppError(404, 'Tariff version not found', 'TARIFF_NOT_FOUND');
    }
    return this.hydrateTariff(res.rows[0]);
  }

  async calculateAndPersistBill(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    previousReading: number;
    currentReading: number;
    previousReadingDate: string;
    currentReadingDate: string;
    readingSource: ReadingSource;
    consumerEligible: boolean;
    fixedChargesInr?: number;
    additionalChargesInr?: number;
  }): Promise<{ calculation: BillCalculationResult; cycle: BillingCycleRecord }> {
    const tariff = await this.getActiveTariff(input.currentReadingDate);
    const ctrRes = await this.db.query<{ counter_reset_count: number }>(
      `SELECT counter_reset_count FROM energy_counters WHERE device_uuid = $1 LIMIT 1`,
      [input.deviceUuid],
    );

    // Check if multiple active/historical tariff effective dates lie inside the cycle period
    const crossingRes = await this.db.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM tariff_versions
       WHERE category = 'LT-IA' AND effective_from > $1::date AND effective_from <= $2::date`,
      [input.previousReadingDate, input.currentReadingDate],
    );
    const existingTariffCrossingDetected = Number(crossingRes.rows[0]?.cnt ?? 0) > 0;

    const calculation = calculateTnebBill({
      deviceId: input.deviceCode,
      serviceCategory: 'LT-IA',
      consumerEligible: input.consumerEligible,
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      previousReadingDate: input.previousReadingDate,
      currentReadingDate: input.currentReadingDate,
      readingSource: input.readingSource,
      tariffVersion: tariff,
      counterResetCount: ctrRes.rows[0]?.counter_reset_count ?? 0,
      fixedChargesInr: input.fixedChargesInr ?? 0,
      additionalChargesInr: input.additionalChargesInr ?? 0,
      existingTariffCrossingDetected,
    });

    const cycleRes = await this.db.query<Record<string, unknown>>(
      `INSERT INTO billing_cycles (
        device_uuid, user_id, period_start, period_end,
        cycle_start_kwh, cycle_end_kwh, units_consumed, reading_source, tariff_version_id, status
      ) VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, 'estimated')
      RETURNING *`,
      [
        input.deviceUuid,
        input.userId,
        input.previousReadingDate,
        input.currentReadingDate,
        calculation.previousReading,
        calculation.currentReading,
        calculation.unitsConsumed,
        input.readingSource,
        tariff.id.match(/^[0-9a-f-]{36}$/i) ? tariff.id : null,
      ],
    );
    const cycleRow = cycleRes.rows[0];

    await this.db.query(
      `INSERT INTO bill_estimates (
        billing_cycle_id, device_uuid, user_id, tariff_version_id, reading_source,
        consumer_eligible, previous_reading, current_reading, units_consumed,
        free_units_applied, energy_charges_inr, fixed_charges_inr, additional_charges_inr,
        total_estimated_amount_inr, calculation_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)`,
      [
        cycleRow.id,
        input.deviceUuid,
        input.userId,
        tariff.id.match(/^[0-9a-f-]{36}$/i) ? tariff.id : null,
        input.readingSource,
        input.consumerEligible,
        calculation.previousReading,
        calculation.currentReading,
        calculation.unitsConsumed,
        calculation.freeUnitsApplied,
        calculation.energyChargesInr,
        calculation.fixedChargesInr,
        calculation.additionalChargesInr,
        calculation.totalEstimatedAmountInr,
        JSON.stringify(calculation),
      ],
    );

    const cycle: BillingCycleRecord = {
      id: String(cycleRow.id),
      deviceId: input.deviceCode,
      userId: input.userId,
      periodStart: input.previousReadingDate,
      periodEnd: input.currentReadingDate,
      previousReading: calculation.previousReading,
      currentReading: calculation.currentReading,
      unitsConsumed: calculation.unitsConsumed,
      readingSource: input.readingSource,
      estimatedAmountInr: calculation.totalEstimatedAmountInr,
      actualBillAmountInr: null,
      varianceAmountInr: null,
      tariffVersionCode: calculation.tariffVersionCode,
      status: 'estimated',
      calculationPayload: calculation,
      createdAt: new Date(String(cycleRow.created_at)).toISOString(),
    };

    return { calculation, cycle };
  }

  async submitManualReading(input: {
    userId: string;
    deviceUuid: string;
    deviceCode: string;
    consumerEligible: boolean;
    previousReading: number;
    previousReadingDate: string;
    currentReading: number;
    currentReadingDate: string;
    meterSerialNumber?: string;
    billPhotoUrl?: string;
    notes?: string;
    preferredSource?: ReadingSource;
  }) {
    if (input.currentReading < input.previousReading) {
      throw new AppError(400, 'Current manual meter reading cannot be lower than previous reading.', 'NEGATIVE_CONSUMPTION');
    }

    const dup = await this.db.query<{ id: string }>(
      `SELECT id FROM manual_readings WHERE device_uuid = $1 AND current_reading_date = $2::date AND current_reading = $3 LIMIT 1`,
      [input.deviceUuid, input.currentReadingDate, input.currentReading],
    );
    if (dup.rows.length > 0) {
      throw new AppError(409, 'Duplicate manual reading already exists for this date and meter value.', 'DUPLICATE_READING');
    }

    const manualUnits = Math.round((input.currentReading - input.previousReading) * 1000) / 1000;

    // Compare against automatic ESP32 readings across the same date window
    const autoRes = await this.db.query<{ min_e: string | null; max_e: string | null }>(
      `SELECT MIN(energy_kwh)::text AS min_e, MAX(energy_kwh)::text AS max_e
       FROM telemetry
       WHERE device_uuid = $1
         AND ingested_at >= ($2 || 'T00:00:00+05:30')::timestamptz
         AND ingested_at <= ($3 || 'T23:59:59+05:30')::timestamptz`,
      [input.deviceUuid, input.previousReadingDate, input.currentReadingDate],
    );
    const minE = autoRes.rows[0]?.min_e ? Number(autoRes.rows[0].min_e) : 0;
    const maxE = autoRes.rows[0]?.max_e ? Number(autoRes.rows[0].max_e) : 0;
    const autoUnits = Math.max(0, Math.round((maxE - minE) * 1000) / 1000);

    const comparison = compareReadingSources(autoUnits, manualUnits);
    const chosenSource: ReadingSource = input.preferredSource ?? 'manual_eb_meter';

    const insertRes = await this.db.query<Record<string, unknown>>(
      `INSERT INTO manual_readings (
        device_uuid, user_id, previous_reading, previous_reading_date,
        current_reading, current_reading_date, units_consumed,
        meter_serial_number, bill_photo_url, notes,
        automatic_comparison_kwh, discrepancy_kwh, discrepancy_percent, selected_for_estimate
      ) VALUES ($1, $2, $3, $4::date, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        input.deviceUuid,
        input.userId,
        input.previousReading,
        input.previousReadingDate,
        input.currentReading,
        input.currentReadingDate,
        manualUnits,
        input.meterSerialNumber || null,
        input.billPhotoUrl || null,
        input.notes || null,
        autoUnits,
        comparison.unitDifference,
        comparison.percentageDifference,
        chosenSource === 'manual_eb_meter',
      ],
    );
    const mr = insertRes.rows[0];

    const billing = await this.calculateAndPersistBill({
      userId: input.userId,
      deviceUuid: input.deviceUuid,
      deviceCode: input.deviceCode,
      previousReading: chosenSource === 'automatic_esp32' && maxE > 0 ? minE : input.previousReading,
      currentReading: chosenSource === 'automatic_esp32' && maxE > 0 ? maxE : input.currentReading,
      previousReadingDate: input.previousReadingDate,
      currentReadingDate: input.currentReadingDate,
      readingSource: chosenSource,
      consumerEligible: input.consumerEligible,
    });

    const reading: ManualReadingRecord = {
      id: String(mr.id),
      deviceId: input.deviceCode,
      userId: input.userId,
      previousReading: Number(mr.previous_reading),
      previousReadingDate: String(mr.previous_reading_date).slice(0, 10),
      currentReading: Number(mr.current_reading),
      currentReadingDate: String(mr.current_reading_date).slice(0, 10),
      unitsConsumed: Number(mr.units_consumed),
      meterSerialNumber: mr.meter_serial_number ? String(mr.meter_serial_number) : null,
      billPhotoUrl: mr.bill_photo_url ? String(mr.bill_photo_url) : null,
      notes: mr.notes ? String(mr.notes) : null,
      automaticComparisonKwh: autoUnits,
      discrepancyKwh: comparison.unitDifference,
      discrepancyPercent: comparison.percentageDifference,
      selectedForEstimate: Boolean(mr.selected_for_estimate),
      createdAt: new Date(String(mr.created_at)).toISOString(),
    };

    return { reading, comparison, billing };
  }

  async getBillingHistory(userId: string): Promise<{
    cycles: BillingCycleRecord[];
    manualReadings: ManualReadingRecord[];
  }> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT bc.*, d.device_id AS device_code,
              be.total_estimated_amount_inr, be.calculation_payload,
              tv.version_code,
              ab.actual_amount_inr, ab.variance_inr
       FROM billing_cycles bc
       JOIN devices d ON d.id = bc.device_uuid
       LEFT JOIN bill_estimates be ON be.billing_cycle_id = bc.id
       LEFT JOIN tariff_versions tv ON tv.id = bc.tariff_version_id
       LEFT JOIN actual_bills ab ON ab.billing_cycle_id = bc.id
       WHERE bc.user_id = $1
       ORDER BY bc.created_at DESC
       LIMIT 100`,
      [userId],
    );

    const cycles: BillingCycleRecord[] = res.rows.map((r) => ({
      id: String(r.id),
      deviceId: String(r.device_code),
      userId: String(r.user_id),
      periodStart: String(r.period_start).slice(0, 10),
      periodEnd: String(r.period_end).slice(0, 10),
      previousReading: Number(r.cycle_start_kwh),
      currentReading: Number(r.cycle_end_kwh),
      unitsConsumed: Number(r.units_consumed),
      readingSource: r.reading_source as ReadingSource,
      estimatedAmountInr: Number(r.total_estimated_amount_inr ?? 0),
      actualBillAmountInr: r.actual_amount_inr == null ? null : Number(r.actual_amount_inr),
      varianceAmountInr: r.variance_inr == null ? null : Number(r.variance_inr),
      tariffVersionCode: String(r.version_code || INDICATIVE_2026_TNEB_LT1A_TARIFF.versionCode),
      status: r.status as BillingCycleRecord['status'],
      calculationPayload: r.calculation_payload as BillCalculationResult,
      createdAt: new Date(String(r.created_at)).toISOString(),
    }));

    const mrRes = await this.db.query<Record<string, unknown>>(
      `SELECT mr.*, d.device_id AS device_code
       FROM manual_readings mr
       JOIN devices d ON d.id = mr.device_uuid
       WHERE mr.user_id = $1
       ORDER BY mr.created_at DESC
       LIMIT 100`,
      [userId],
    );
    const manualReadings: ManualReadingRecord[] = mrRes.rows.map((mr) => ({
      id: String(mr.id),
      deviceId: String(mr.device_code),
      userId: String(mr.user_id),
      previousReading: Number(mr.previous_reading),
      previousReadingDate: String(mr.previous_reading_date).slice(0, 10),
      currentReading: Number(mr.current_reading),
      currentReadingDate: String(mr.current_reading_date).slice(0, 10),
      unitsConsumed: Number(mr.units_consumed),
      meterSerialNumber: mr.meter_serial_number ? String(mr.meter_serial_number) : null,
      billPhotoUrl: mr.bill_photo_url ? String(mr.bill_photo_url) : null,
      notes: mr.notes ? String(mr.notes) : null,
      automaticComparisonKwh: mr.automatic_comparison_kwh == null ? null : Number(mr.automatic_comparison_kwh),
      discrepancyKwh: mr.discrepancy_kwh == null ? null : Number(mr.discrepancy_kwh),
      discrepancyPercent: mr.discrepancy_percent == null ? null : Number(mr.discrepancy_percent),
      selectedForEstimate: Boolean(mr.selected_for_estimate),
      createdAt: new Date(String(mr.created_at)).toISOString(),
    }));

    return { cycles, manualReadings };
  }

  async getBillingRecordById(userId: string, cycleId: string): Promise<BillingCycleRecord> {
    const history = await this.getBillingHistory(userId);
    const found = history.cycles.find((c) => c.id === cycleId);
    if (!found) {
      throw new AppError(404, 'Billing record not found', 'BILLING_NOT_FOUND');
    }
    return found;
  }

  async recordActualBill(
    userId: string,
    cycleId: string,
    actualAmountInr: number,
    officialBillNumber?: string,
  ) {
    const cycle = await this.getBillingRecordById(userId, cycleId);
    const devRes = await this.db.query<{ id: string }>(`SELECT id FROM devices WHERE device_id = $1 LIMIT 1`, [
      cycle.deviceId,
    ]);
    const devUuid = devRes.rows[0]?.id;
    const variance = Math.round((actualAmountInr - cycle.estimatedAmountInr) * 100) / 100;

    await this.db.query(
      `INSERT INTO actual_bills (billing_cycle_id, device_uuid, user_id, actual_amount_inr, official_bill_number, variance_inr)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (billing_cycle_id) DO UPDATE SET
         actual_amount_inr = EXCLUDED.actual_amount_inr,
         official_bill_number = EXCLUDED.official_bill_number,
         variance_inr = EXCLUDED.variance_inr`,
      [cycleId, devUuid, userId, actualAmountInr, officialBillNumber || null, variance],
    );
    await this.db.query(`UPDATE billing_cycles SET status = 'billed' WHERE id = $1`, [cycleId]);

    return { ...cycle, actualBillAmountInr: actualAmountInr, varianceAmountInr: variance, status: 'billed' };
  }

  private async hydrateTariff(row: Record<string, unknown>): Promise<TariffVersion> {
    const slabsRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM tariff_slabs WHERE tariff_version_id = $1 ORDER BY branch, slab_order ASC`,
      [row.id],
    );
    const subRes = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM subsidy_rules WHERE tariff_version_id = $1 LIMIT 1`,
      [row.id],
    );
    const sub = subRes.rows[0];

    return {
      id: String(row.id),
      versionCode: String(row.version_code),
      category: String(row.category),
      effectiveFrom: String(row.effective_from).slice(0, 10),
      effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
      status: row.status as TariffVersion['status'],
      isIndicative: Boolean(row.is_indicative),
      officialVerified: Boolean(row.official_verified),
      sourceReference: String(row.source_reference),
      slabs: slabsRes.rows.map((s) => ({
        id: String(s.id),
        slabOrder: Number(s.slab_order),
        branch: s.branch as TariffSlab['branch'],
        fromUnit: Number(s.from_unit),
        toUnit: s.to_unit == null ? null : Number(s.to_unit),
        ratePerUnitInr: Number(s.rate_per_unit_inr),
        fixedChargeInr: Number(s.fixed_charge_inr),
        description: String(s.description),
      })),
      subsidyRule: sub
        ? {
            id: String(sub.id),
            name: String(sub.name),
            freeUnitsUpto500: Number(sub.free_units_upto_500),
            freeUnitsAbove500: Number(sub.free_units_above_500),
            eligibilityRequired: Boolean(sub.eligibility_required),
            notes: String(sub.notes ?? ''),
          }
        : INDICATIVE_2026_TNEB_LT1A_TARIFF.subsidyRule,
      approvedByUserId: row.approved_by_user_id ? String(row.approved_by_user_id) : null,
      approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
    };
  }
}
