class SlabLine {
  final String label;
  final double units;
  final double rateInr;
  final double amountInr;
  final bool isSubsidyFree;

  const SlabLine({
    required this.label,
    required this.units,
    required this.rateInr,
    required this.amountInr,
    required this.isSubsidyFree,
  });
}

class BillCalculationSummary {
  final String deviceId;
  final double previousReading;
  final double currentReading;
  final double unitsConsumed;
  final double freeUnitsApplied;
  final double billableUnits;
  final String branchApplied;
  final List<SlabLine> slabs;
  final double energyChargesInr;
  final double fixedChargesInr;
  final double additionalChargesInr;
  final double totalEstimatedAmountInr;
  final String tariffVersionCode;
  final String readingSource;
  final bool consumerEligible;
  final List<String> warnings;

  const BillCalculationSummary({
    required this.deviceId,
    required this.previousReading,
    required this.currentReading,
    required this.unitsConsumed,
    required this.freeUnitsApplied,
    required this.billableUnits,
    required this.branchApplied,
    required this.slabs,
    required this.energyChargesInr,
    required this.fixedChargesInr,
    required this.additionalChargesInr,
    required this.totalEstimatedAmountInr,
    required this.tariffVersionCode,
    required this.readingSource,
    required this.consumerEligible,
    required this.warnings,
  });
}

class TnebBillingEngine {
  static double _round2(double v) => (v * 100).roundToDouble() / 100;
  static double _round3(double v) => (v * 1000).roundToDouble() / 1000;

  static BillCalculationSummary calculateIndicative2026({
    required String deviceId,
    required double previousReading,
    required double currentReading,
    required String previousReadingDate,
    required String currentReadingDate,
    required String readingSource,
    bool consumerEligible = true,
    double fixedChargesInr = 0,
    double additionalChargesInr = 0,
  }) {
    if (previousReading < 0 || currentReading < 0) {
      throw ArgumentError('Meter readings cannot be negative.');
    }
    if (currentReading < previousReading && readingSource == 'manual_eb_meter') {
      throw ArgumentError('Current manual EB reading cannot be lower than previous reading.');
    }

    final warnings = <String>[
      'ESTIMATE ONLY — Indicative 2026 TNEB LT-IA schedule. Verify official TNERC/TNPDCL tariff & subsidy orders.',
    ];

    double unitsConsumed;
    if (currentReading < previousReading) {
      unitsConsumed = _round3(currentReading);
      warnings.add('Automatic ESP32 counter decreased; possible reset detected.');
    } else {
      unitsConsumed = _round3(currentReading - previousReading);
    }

    final eff = DateTime.parse('2026-07-01');
    final prevD = DateTime.tryParse(previousReadingDate);
    final currD = DateTime.tryParse(currentReadingDate);
    if (prevD != null && currD != null && prevD.isBefore(eff) && !currD.isBefore(eff)) {
      warnings.add('Cycle crosses tariff effective date 2026-07-01; verify official non-proration guidance.');
    }

    final branch = !consumerEligible
        ? 'BASE_NON_SUBSIDY'
        : (unitsConsumed <= 500 ? 'UPTO_500' : 'ABOVE_500');

    final freeAllowance = !consumerEligible
        ? 0.0
        : (unitsConsumed <= 500 ? 200.0 : 100.0);

    final slabSpecs = branch == 'BASE_NON_SUBSIDY'
        ? [
            (0.0, 400.0, 4.70),
            (400.0, 500.0, 6.30),
            (500.0, 600.0, 8.40),
            (600.0, 800.0, 9.45),
            (800.0, 1000.0, 10.50),
            (1000.0, double.infinity, 11.55),
          ]
        : branch == 'UPTO_500'
            ? [
                (0.0, 200.0, 4.70),
                (200.0, 400.0, 4.70),
                (400.0, 500.0, 6.30),
              ]
            : [
                (0.0, 100.0, 4.70),
                (100.0, 400.0, 4.70),
                (400.0, 500.0, 6.30),
                (500.0, 600.0, 8.40),
                (600.0, 800.0, 9.45),
                (800.0, 1000.0, 10.50),
                (1000.0, double.infinity, 11.55),
              ];

    var remainingFree = unitsConsumed < freeAllowance ? unitsConsumed : freeAllowance;
    var totalFree = 0.0;
    var energyCharges = 0.0;
    final lines = <SlabLine>[];

    for (final (fromU, toU, rate) in slabSpecs) {
      if (unitsConsumed <= fromU) break;
      final upper = unitsConsumed < toU ? unitsConsumed : toU;
      final rawInSlab = upper - fromU;
      if (rawInSlab <= 0) continue;

      final freeHere = rawInSlab < remainingFree ? rawInSlab : remainingFree;
      final paidHere = _round3(rawInSlab - freeHere);
      remainingFree = _round3(remainingFree - freeHere);

      if (freeHere > 0) {
        totalFree = _round3(totalFree + freeHere);
        lines.add(SlabLine(
          label: '${fromU.toInt() + 1}-${(fromU + freeHere).round()} (Free)',
          units: _round3(freeHere),
          rateInr: 0,
          amountInr: 0,
          isSubsidyFree: true,
        ));
      }

      if (paidHere > 0) {
        final amt = _round2(paidHere * rate);
        energyCharges = _round2(energyCharges + amt);
        final label = toU.isInfinite
            ? 'Above ${fromU.toInt()}'
            : '${(fromU + freeHere).round() + 1}-${toU.toInt()}';
        lines.add(SlabLine(
          label: label,
          units: paidHere,
          rateInr: rate,
          amountInr: amt,
          isSubsidyFree: false,
        ));
      }
    }

    final total = _round2(energyCharges + fixedChargesInr + additionalChargesInr);
    return BillCalculationSummary(
      deviceId: deviceId,
      previousReading: _round3(previousReading),
      currentReading: _round3(currentReading),
      unitsConsumed: unitsConsumed,
      freeUnitsApplied: totalFree,
      billableUnits: _round3(unitsConsumed - totalFree),
      branchApplied: branch,
      slabs: lines,
      energyChargesInr: energyCharges,
      fixedChargesInr: _round2(fixedChargesInr),
      additionalChargesInr: _round2(additionalChargesInr),
      totalEstimatedAmountInr: total,
      tariffVersionCode: 'TNEB-LT1A-2026-IND',
      readingSource: readingSource,
      consumerEligible: consumerEligible,
      warnings: warnings,
    );
  }
}
