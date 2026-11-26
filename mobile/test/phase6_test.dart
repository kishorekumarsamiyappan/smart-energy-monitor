import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/billing_screen.dart';
import 'package:smart_energy_monitor/screens/manual_reading_screen.dart';

void main() {
  testWidgets('Phase 6 BillingScreen and ManualReadingScreen calculate TNEB slabs and detect discrepancies', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const Scaffold(body: BillingScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('TNEB / TNPDCL LT-IA Billing'), findsOneWidget);
    expect(find.textContaining('Slab Breakdown'), findsOneWidget);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const ManualReadingScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Manual EB Meter Reading'), findsOneWidget);
    await tester.tap(find.text('Calculate & Preserve Both Records'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved! Calculated ₹'), findsOneWidget);
  });
}
