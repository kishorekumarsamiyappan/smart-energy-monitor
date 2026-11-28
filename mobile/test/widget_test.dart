import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/billing/tneb_billing_engine.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/login_screen.dart';

void main() {
  test('TNEB LT-IA billing boundary tests match indicative 2026 rules', () {
    final cases = <int, double>{
      0: 0,
      100: 0,
      199: 0,
      200: 0,
      201: 4.70,
      300: 470.0,
      400: 940.0,
      401: 946.30,
      499: 1563.70,
      500: 1570.0,
      501: 2048.40,
      600: 2880.0,
      601: 2889.45,
      800: 4770.0,
      801: 4780.50,
      1000: 6870.0,
      1001: 6881.55,
    };

    cases.forEach((units, expected) {
      final res = TnebBillingEngine.calculateIndicative2026(
        deviceId: 'SEM_ESP32S3_01',
        previousReading: 1000,
        currentReading: 1000.0 + units,
        previousReadingDate: '2026-09-01',
        currentReadingDate: '2026-11-01',
        readingSource: 'automatic_esp32',
        consumerEligible: true,
      );
      expect(res.totalEstimatedAmountInr, closeTo(expected, 0.01), reason: 'Failed for $units units');
    });
  });

  testWidgets('Phase 1 LoginScreen renders AVR indigo design and enters Demo Mode', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final appState = AppState();
    await appState.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const LoginScreen(),
        ),
      ),
    );

    expect(find.text('Welcome Back'), findsOneWidget);
    expect(find.text('Try Interactive Demo Mode'), findsOneWidget);

    await tester.tap(find.text('Try Interactive Demo Mode'));
    await tester.pumpAndSettle();

    expect(appState.isDemoMode, isTrue);
    expect(appState.devices.length, 2);
    expect(find.textContaining('DEMO'), findsWidgets);
  });
}
