import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/alerts_screen.dart';
import 'package:smart_energy_monitor/screens/profile_screen.dart';

void main() {
  testWidgets('Phase 8 AlertsScreen and ProfileScreen support acknowledgement, theme switch, and legal dialogs', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: SemTheme.light(), home: const AlertsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Advisory Monitoring Only'), findsOneWidget);
    await tester.tap(find.text('Acknowledge').first);
    await tester.pumpAndSettle();
    expect(state.activeAlertsCount, 1);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          darkTheme: SemTheme.dark(),
          themeMode: state.themeMode,
          home: const Scaffold(body: ProfileScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('ARJUN KRISHNAN (DEMO)'), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms & Condition'), findsOneWidget);

    await tester.tap(find.textContaining('Theme (Light Mode)'));
    await tester.pumpAndSettle();
    expect(state.themeMode, ThemeMode.dark);
  });
}
