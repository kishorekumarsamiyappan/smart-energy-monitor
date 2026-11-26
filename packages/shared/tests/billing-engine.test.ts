import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BillingValidationError,
  calculateTnebBill,
  compareReadingSources,
  INDICATIVE_2026_TNEB_LT1A_TARIFF,
} from '../src/billing-engine.js';

const baseInput = {
  deviceId: 'DEVICE001',
  serviceCategory: 'LT-IA' as const,
  consumerEligible: true,
  previousReading: 1000,
  previousReadingDate: '2026-09-01',
  currentReadingDate: '2026-11-01',
  readingSource: 'automatic_esp32' as const,
  tariffVersion: INDICATIVE_2026_TNEB_LT1A_TARIFF,
};

const boundaryExpectations: Array<{
  units: number;
  expectedAmount: number;
  expectedFree: number;
  expectedBranch: 'UPTO_500' | 'ABOVE_500';
}> = [
  { units: 0, expectedAmount: 0, expectedFree: 0, expectedBranch: 'UPTO_500' },
  { units: 100, expectedAmount: 0, expectedFree: 100, expectedBranch: 'UPTO_500' },
  { units: 199, expectedAmount: 0, expectedFree: 199, expectedBranch: 'UPTO_500' },
  { units: 200, expectedAmount: 0, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 201, expectedAmount: 4.7, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 300, expectedAmount: 470, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 400, expectedAmount: 940, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 401, expectedAmount: 946.3, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 499, expectedAmount: 1563.7, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 500, expectedAmount: 1570, expectedFree: 200, expectedBranch: 'UPTO_500' },
  { units: 501, expectedAmount: 2048.4, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 600, expectedAmount: 2880, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 601, expectedAmount: 2889.45, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 800, expectedAmount: 4770, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 801, expectedAmount: 4780.5, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 1000, expectedAmount: 6870, expectedFree: 100, expectedBranch: 'ABOVE_500' },
  { units: 1001, expectedAmount: 6881.55, expectedFree: 100, expectedBranch: 'ABOVE_500' },
];

for (const tc of boundaryExpectations) {
  test(`TNEB LT-IA boundary calculation: ${tc.units} units`, () => {
    const result = calculateTnebBill({
      ...baseInput,
      currentReading: baseInput.previousReading + tc.units,
    });

    assert.equal(result.unitsConsumed, tc.units);
    assert.equal(result.freeUnitsApplied, tc.expectedFree);
    assert.equal(result.tariffBranchApplied, tc.expectedBranch);
    assert.equal(result.totalEstimatedAmountInr, tc.expectedAmount);
    assert.equal(result.isOfficialBill, false);
    assert.ok(result.warnings.some((w) => w.includes('indicative 2026')));
  });
}

test('Non-eligible consumer uses BASE_NON_SUBSIDY branch with zero free units', () => {
  const result = calculateTnebBill({
    ...baseInput,
    consumerEligible: false,
    currentReading: 1200, // 200 units
  });

  assert.equal(result.tariffBranchApplied, 'BASE_NON_SUBSIDY');
  assert.equal(result.freeUnitsApplied, 0);
  assert.equal(result.billableUnits, 200);
  assert.equal(result.totalEstimatedAmountInr, 940); // 200 * 4.70
  assert.equal(result.eligibilityStatus, 'not_eligible');
});

test('Manual reading rejects negative consumption', () => {
  assert.throws(
    () =>
      calculateTnebBill({
        ...baseInput,
        readingSource: 'manual_eb_meter',
        previousReading: 1500,
        currentReading: 1450,
      }),
    (err: unknown) => err instanceof BillingValidationError && err.code === 'NEGATIVE_CONSUMPTION',
  );
});

test('Automatic ESP32 reading flags counter reset when current < previous', () => {
  const result = calculateTnebBill({
    ...baseInput,
    readingSource: 'automatic_esp32',
    previousReading: 1500,
    currentReading: 120,
    counterResetCount: 1,
  });

  assert.equal(result.counterResetDetected, true);
  assert.equal(result.unitsConsumed, 120);
  assert.ok(result.warnings.some((w) => w.includes('lifetime kWh decreased')));
});

test('Missing or non-finite readings throw MISSING_READING', () => {
  assert.throws(
    () =>
      calculateTnebBill({
        ...baseInput,
        currentReading: Number.NaN,
      }),
    (err: unknown) => err instanceof BillingValidationError && err.code === 'MISSING_READING',
  );
});

test('Negative meter reading throws NEGATIVE_READING', () => {
  assert.throws(
    () =>
      calculateTnebBill({
        ...baseInput,
        previousReading: -5,
        currentReading: 100,
      }),
    (err: unknown) => err instanceof BillingValidationError && err.code === 'NEGATIVE_READING',
  );
});

test('Billing cycle crossing tariff effective date raises explicit non-proration warning', () => {
  const result = calculateTnebBill({
    ...baseInput,
    previousReadingDate: '2026-06-01',
    currentReadingDate: '2026-08-01', // crosses 2026-07-01
    currentReading: 1300,
  });

  assert.equal(result.crossesTariffEffectiveDate, true);
  assert.ok(result.warnings.some((w) => w.includes('crosses tariff effective date')));
});

test('Manual vs automatic comparison detects discrepancy and preserves figures', () => {
  const agreed = compareReadingSources(302.5, 304.0);
  assert.equal(agreed.disagrees, false);
  assert.equal(agreed.unitDifference, 1.5);

  const disagreed = compareReadingSources(290.0, 325.0);
  assert.equal(disagreed.disagrees, true);
  assert.equal(disagreed.unitDifference, 35);
  assert.ok((disagreed.percentageDifference ?? 0) > 10);
});
