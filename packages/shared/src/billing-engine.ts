import {
  BillCalculationInput,
  BillCalculationResult,
  ReadingComparison,
  SlabCalculationLine,
  TariffSlab,
  TariffVersion,
} from './types.js';

/**
 * Indicative 2026 TNEB / TNPDCL LT-IA Domestic Bi-Monthly Tariff Schedule.
 * Kept strictly configurable and flagged as indicative until verified against
 * official TNERC/TNPDCL tariff & subsidy orders by an administrator.
 */
export const INDICATIVE_2026_TNEB_LT1A_TARIFF: TariffVersion = {
  id: 'tariff-tneb-lt1a-2026-ind',
  versionCode: 'TNEB-LT1A-2026-IND',
  category: 'LT-IA',
  effectiveFrom: '2026-07-01',
  effectiveTo: null,
  status: 'active',
  isIndicative: true,
  officialVerified: false,
  sourceReference:
    'TNEB LT-IA bi-monthly domestic schedule (verified against https://tneb-billcalculator.in/ — verify official TNERC order before official billing)',
  subsidyRule: {
    id: 'subsidy-lt1a-2026-ind',
    name: 'TN Domestic Bi-Monthly Free Unit Subsidy (Indicative)',
    freeUnitsUpto500: 200,
    freeUnitsAbove500: 100,
    eligibilityRequired: true,
    notes:
      'Eligible domestic consumers <= 500 bi-monthly units receive first 200 units free; > 500 units receive first 100 units free. Base tariff & subsidy kept separate.',
  },
  slabs: [
    // Branch 1: Base / Non-subsidized rates (no free units deducted)
    {
      slabOrder: 1,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 0,
      toUnit: 400,
      ratePerUnitInr: 4.7,
      fixedChargeInr: 0,
      description: 'Base 1 - 400 units (non-subsidized)',
    },
    {
      slabOrder: 2,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 400,
      toUnit: 500,
      ratePerUnitInr: 6.3,
      fixedChargeInr: 0,
      description: 'Base 401 - 500 units',
    },
    {
      slabOrder: 3,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 500,
      toUnit: 600,
      ratePerUnitInr: 8.4,
      fixedChargeInr: 0,
      description: 'Base 501 - 600 units',
    },
    {
      slabOrder: 4,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 600,
      toUnit: 800,
      ratePerUnitInr: 9.45,
      fixedChargeInr: 0,
      description: 'Base 601 - 800 units',
    },
    {
      slabOrder: 5,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 800,
      toUnit: 1000,
      ratePerUnitInr: 10.5,
      fixedChargeInr: 0,
      description: 'Base 801 - 1000 units',
    },
    {
      slabOrder: 6,
      branch: 'BASE_NON_SUBSIDY',
      fromUnit: 1000,
      toUnit: null,
      ratePerUnitInr: 11.55,
      fixedChargeInr: 0,
      description: 'Base Above 1000 units',
    },

    // Branch 2: Consumption <= 500 units (post-subsidy rates; free units applied via SubsidyRule)
    {
      slabOrder: 1,
      branch: 'UPTO_500',
      fromUnit: 0,
      toUnit: 200,
      ratePerUnitInr: 4.7, // base reference before subsidy; subsidy rule zeroes first 200 when eligible
      fixedChargeInr: 0,
      description: '1 - 200 units',
    },
    {
      slabOrder: 2,
      branch: 'UPTO_500',
      fromUnit: 200,
      toUnit: 400,
      ratePerUnitInr: 4.7,
      fixedChargeInr: 0,
      description: '201 - 400 units',
    },
    {
      slabOrder: 3,
      branch: 'UPTO_500',
      fromUnit: 400,
      toUnit: 500,
      ratePerUnitInr: 6.3,
      fixedChargeInr: 0,
      description: '401 - 500 units',
    },

    // Branch 3: Consumption > 500 units (first 100 free when eligible; remaining slabs per governing schedule)
    {
      slabOrder: 1,
      branch: 'ABOVE_500',
      fromUnit: 0,
      toUnit: 100,
      ratePerUnitInr: 4.7, // base reference; subsidy zeroes first 100 when eligible
      fixedChargeInr: 0,
      description: '1 - 100 units',
    },
    {
      slabOrder: 2,
      branch: 'ABOVE_500',
      fromUnit: 100,
      toUnit: 400,
      ratePerUnitInr: 4.7,
      fixedChargeInr: 0,
      description: '101 - 400 units',
    },
    {
      slabOrder: 3,
      branch: 'ABOVE_500',
      fromUnit: 400,
      toUnit: 500,
      ratePerUnitInr: 6.3,
      fixedChargeInr: 0,
      description: '401 - 500 units',
    },
    {
      slabOrder: 4,
      branch: 'ABOVE_500',
      fromUnit: 500,
      toUnit: 600,
      ratePerUnitInr: 8.4,
      fixedChargeInr: 0,
      description: '501 - 600 units',
    },
    {
      slabOrder: 5,
      branch: 'ABOVE_500',
      fromUnit: 600,
      toUnit: 800,
      ratePerUnitInr: 9.45,
      fixedChargeInr: 0,
      description: '601 - 800 units',
    },
    {
      slabOrder: 6,
      branch: 'ABOVE_500',
      fromUnit: 800,
      toUnit: 1000,
      ratePerUnitInr: 10.5,
      fixedChargeInr: 0,
      description: '801 - 1000 units',
    },
    {
      slabOrder: 7,
      branch: 'ABOVE_500',
      fromUnit: 1000,
      toUnit: null,
      ratePerUnitInr: 11.55,
      fixedChargeInr: 0,
      description: 'Above 1000 units',
    },
  ],
};

export class BillingValidationError extends Error {
  constructor(
    public readonly code:
      | 'MISSING_READING'
      | 'NEGATIVE_READING'
      | 'NEGATIVE_CONSUMPTION'
      | 'INVALID_DATES'
      | 'DUPLICATE_READING'
      | 'MISSING_TARIFF_SLABS',
    message: string,
  ) {
    super(message);
    this.name = 'BillingValidationError';
  }
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * Computes TNEB/TNPDCL LT-IA bi-monthly domestic electricity bill estimate.
 * - Keeps base tariff rates separate from consumer subsidy free-unit allowance.
 * - Never deducts free units twice.
 * - Flags indicative tariffs, counter resets, and effective-date crossings explicitly.
 */
export function calculateTnebBill(input: BillCalculationInput): BillCalculationResult {
  const {
    deviceId,
    previousReading,
    currentReading,
    previousReadingDate,
    currentReadingDate,
    readingSource,
    consumerEligible,
    tariffVersion,
    counterResetCount = 0,
    additionalChargesInr = 0,
    fixedChargesInr = 0,
    existingTariffCrossingDetected = false,
  } = input;

  if (
    previousReading === null ||
    previousReading === undefined ||
    currentReading === null ||
    currentReading === undefined ||
    !Number.isFinite(previousReading) ||
    !Number.isFinite(currentReading)
  ) {
    throw new BillingValidationError(
      'MISSING_READING',
      'Previous and current meter readings must be finite numbers.',
    );
  }

  if (previousReading < 0 || currentReading < 0) {
    throw new BillingValidationError(
      'NEGATIVE_READING',
      'Meter readings cannot be negative.',
    );
  }

  const prevDate = new Date(previousReadingDate);
  const currDate = new Date(currentReadingDate);
  if (Number.isNaN(prevDate.getTime()) || Number.isNaN(currDate.getTime()) || currDate < prevDate) {
    throw new BillingValidationError(
      'INVALID_DATES',
      'Current reading date must be a valid date on or after the previous reading date.',
    );
  }

  const warnings: string[] = [];
  let counterResetDetected = counterResetCount > 0;

  let unitsConsumed: number;
  if (currentReading < previousReading) {
    if (readingSource === 'manual_eb_meter') {
      throw new BillingValidationError(
        'NEGATIVE_CONSUMPTION',
        `Current EB meter reading (${currentReading}) is lower than previous reading (${previousReading}). Verify meter rollover or typo.`,
      );
    }
    // Automatic counter anomaly (should not happen with persistent lifetime kWh, flag explicitly)
    counterResetDetected = true;
    unitsConsumed = roundUnits(currentReading);
    warnings.push(
      `Automatic lifetime kWh decreased (${previousReading} -> ${currentReading}). Possible NVS counter reset or device replacement; verify cycle start baseline.`,
    );
  } else {
    unitsConsumed = roundUnits(currentReading - previousReading);
  }

  if (counterResetCount > 0) {
    warnings.push(
      `Detected ${counterResetCount} counter reset event(s) during this billing cycle. Verify cumulative continuity.`,
    );
  }

  // Check if cycle crosses the active tariff's effectiveFrom date
  const effFrom = new Date(`${tariffVersion.effectiveFrom}T00:00:00+05:30`);
  const crossesTariffEffectiveDate =
    existingTariffCrossingDetected || (prevDate < effFrom && currDate >= effFrom);

  if (crossesTariffEffectiveDate) {
    warnings.push(
      `Billing period (${previousReadingDate} to ${currentReadingDate}) crosses tariff effective date ${tariffVersion.effectiveFrom}. Per official billing rules, automatic proration is not assumed; verify TNERC/TNPDCL transition instructions.`,
    );
  }

  if (tariffVersion.isIndicative || !tariffVersion.officialVerified) {
    warnings.push(
      'ESTIMATE ONLY — Based on indicative 2026 tariff rates. Verify official TNERC/TNPDCL tariff & subsidy orders before treating as an official EB bill.',
    );
  }

  // Select tariff branch strictly based on total consumption before subsidy (and consumer eligibility)
  const tariffBranchApplied: BillCalculationResult['tariffBranchApplied'] = !consumerEligible
    ? 'BASE_NON_SUBSIDY'
    : unitsConsumed <= 500
      ? 'UPTO_500'
      : 'ABOVE_500';

  const branchSlabs: TariffSlab[] = tariffVersion.slabs
    .filter((s) => s.branch === tariffBranchApplied)
    .sort((a, b) => a.slabOrder - b.slabOrder);

  if (branchSlabs.length === 0) {
    throw new BillingValidationError(
      'MISSING_TARIFF_SLABS',
      `No tariff slabs configured for branch ${tariffBranchApplied} in version ${tariffVersion.versionCode}.`,
    );
  }

  // Determine free-unit subsidy allowance ONCE (never deduct twice)
  const freeUnitAllowance =
    consumerEligible && tariffVersion.subsidyRule.eligibilityRequired
      ? unitsConsumed <= 500
        ? tariffVersion.subsidyRule.freeUnitsUpto500
        : tariffVersion.subsidyRule.freeUnitsAbove500
      : 0;

  let remainingFreeUnits = Math.min(unitsConsumed, freeUnitAllowance);
  let freeUnitsApplied = 0;
  let subsidySavingsInr = 0;
  let energyChargesInr = 0;
  const slabBreakdown: SlabCalculationLine[] = [];

  for (const slab of branchSlabs) {
    if (unitsConsumed <= slab.fromUnit) {
      break;
    }
    const upperBound = slab.toUnit ?? Number.POSITIVE_INFINITY;
    const rawUnitsInSlab = Math.max(0, Math.min(unitsConsumed, upperBound) - slab.fromUnit);
    if (rawUnitsInSlab <= 0) continue;

    // Apply free-unit subsidy sequentially from the lowest unit slabs without double deduction
    const freeInThisSlab = Math.min(rawUnitsInSlab, remainingFreeUnits);
    const paidInThisSlab = roundUnits(rawUnitsInSlab - freeInThisSlab);
    remainingFreeUnits = roundUnits(remainingFreeUnits - freeInThisSlab);

    if (freeInThisSlab > 0) {
      freeUnitsApplied = roundUnits(freeUnitsApplied + freeInThisSlab);
      const saved = roundCurrency(freeInThisSlab * slab.ratePerUnitInr);
      subsidySavingsInr = roundCurrency(subsidySavingsInr + saved);
      slabBreakdown.push({
        slabLabel: `${slab.fromUnit + 1}-${slab.fromUnit + Math.round(freeInThisSlab)} (Free Subsidy)`,
        fromUnit: slab.fromUnit,
        toUnit: slab.fromUnit + freeInThisSlab,
        unitsInSlab: roundUnits(freeInThisSlab),
        ratePerUnitInr: 0,
        amountInr: 0,
        isSubsidyFree: true,
      });
    }

    if (paidInThisSlab > 0) {
      const slabAmount = roundCurrency(paidInThisSlab * slab.ratePerUnitInr);
      energyChargesInr = roundCurrency(energyChargesInr + slabAmount);
      slabBreakdown.push({
        slabLabel:
          slab.toUnit === null
            ? `Above ${slab.fromUnit}`
            : `${Math.round(slab.fromUnit + freeInThisSlab) + 1}-${slab.toUnit}`,
        fromUnit: slab.fromUnit + freeInThisSlab,
        toUnit: slab.toUnit,
        unitsInSlab: paidInThisSlab,
        ratePerUnitInr: slab.ratePerUnitInr,
        amountInr: slabAmount,
        isSubsidyFree: false,
      });
    }
  }

  const billableUnits = roundUnits(Math.max(0, unitsConsumed - freeUnitsApplied));
  const cleanFixed = roundCurrency(Math.max(0, fixedChargesInr));
  const cleanExtra = roundCurrency(Math.max(0, additionalChargesInr));
  const totalEstimatedAmountInr = roundCurrency(energyChargesInr + cleanFixed + cleanExtra);

  return {
    deviceId,
    serviceCategory: 'LT-IA',
    previousReading: roundUnits(previousReading),
    currentReading: roundUnits(currentReading),
    unitsConsumed,
    tariffBranchApplied,
    freeUnitsApplied,
    billableUnits,
    slabBreakdown,
    energyChargesInr,
    fixedChargesInr: cleanFixed,
    additionalChargesInr: cleanExtra,
    subsidySavingsInr,
    totalEstimatedAmountInr,
    tariffVersionCode: tariffVersion.versionCode,
    readingSource,
    eligibilityStatus: consumerEligible ? 'eligible' : 'not_eligible',
    calculationDate: new Date().toISOString(),
    isOfficialBill: false,
    warnings,
    counterResetDetected,
    crossesTariffEffectiveDate,
  };
}

/**
 * Compares manual EB meter reading units against ESP32 automatic cycle consumption.
 * Preserves both sources and flags discrepancies >= 2% or >= 5 units.
 */
export function compareReadingSources(
  automaticKwh: number,
  manualKwh: number,
): ReadingComparison {
  const autoClean = roundUnits(Math.max(0, automaticKwh));
  const manualClean = roundUnits(Math.max(0, manualKwh));
  const unitDifference = roundUnits(Math.abs(manualClean - autoClean));
  const percentageDifference =
    manualClean > 0 ? roundCurrency((unitDifference / manualClean) * 100) : autoClean > 0 ? 100 : 0;

  const disagrees = unitDifference >= 5 || (percentageDifference !== null && percentageDifference >= 2);

  return {
    automaticKwh: autoClean,
    manualKwh: manualClean,
    unitDifference,
    percentageDifference,
    disagrees,
    recommendedPrompt: disagrees
      ? `Manual reading (${manualClean} kWh) and ESP32 reading (${autoClean} kWh) differ by ${unitDifference} kWh (${percentageDifference}%). Choose which source to use for this estimate; both records are preserved.`
      : 'Manual and ESP32 readings agree within tolerance.',
  };
}
