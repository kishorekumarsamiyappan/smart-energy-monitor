import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/device_settings_screen.dart';
import 'package:smart_energy_monitor/screens/main_shell_screen.dart';
import 'package:smart_energy_monitor/screens/monitoring_screen.dart';

void main() {
  testWidgets('Phase 2 Dashboard, Monitoring, and Device Settings render with Demo data', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const MainShellScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Main Home DB (Demo)'), findsOneWidget);
    expect(find.textContaining('Current Bi-Monthly Est.'), findsWidgets);

    // Search filters out DEMO-SEM-001
    await tester.enterText(find.byType(TextField).first, 'DEMO-SEM-002');
    await tester.pumpAndSettle();
    expect(find.textContaining('Main Home DB (Demo)'), findsNothing);
    expect(find.textContaining('First Floor AC Sub-Meter (Demo)'), findsOneWidget);

    // Monitoring Screen
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: SemTheme.light(), home: const MonitoringScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Electrical Monitor'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Min / Max'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Min / Max'), findsOneWidget);

    // Device Settings 5 menu items
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const DeviceSettingsScreen(deviceId: 'DEMO-SEM-001'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sensor Settings'), findsOneWidget);
    expect(find.text('Sensor Configuration'), findsOneWidget);
    expect(find.text('I/O Configuration'), findsOneWidget);
    expect(find.text('Mode Settings'), findsOneWidget);
    expect(find.text('Summary'), findsOneWidget);
  });
}
