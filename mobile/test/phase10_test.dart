import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/device_settings_screen.dart';
import 'package:smart_energy_monitor/screens/relays_screen.dart';

void main() {
  testWidgets('Phase 10 RelaysScreen manages confirmed CH1, CH2 addition, and offline RTC schedules', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const RelaysScreen(deviceId: 'DEMO-SEM-001'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('CONFIRMED DEFAULT RELAY'), findsOneWidget);
    expect(find.textContaining('Morning Geyser Window'), findsOneWidget);

    // Scroll down to Add Optional Relay card and enter CH2 on safe GPIO 16
    await tester.scrollUntilVisible(
      find.text('Add New Relay'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(find.widgetWithText(TextField, 'New Relay Name'), 'Submersible Pump');
    await tester.enterText(find.widgetWithText(TextField, 'ESP32-S3 GPIO Pin (1-48)'), '16');
    await tester.tap(find.text('Add New Relay'));
    await tester.pumpAndSettle();

    expect(find.text('Submersible Pump'), findsOneWidget);
    expect(find.text('CH2'), findsOneWidget);
    expect(state.relaysByDevice['DEMO-SEM-001']!.length, 2);

    // Add offline schedule via dialog
    await tester.scrollUntilVisible(
      find.text('Add Schedule').first,
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Add Schedule').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Schedule'));
    await tester.pumpAndSettle();
    expect(find.text('Scheduled Timer'), findsOneWidget);
  });

  testWidgets('Phase 10 DeviceSettingsScreen updates Status LED / Pulse LED config and triggers GitHub FOTA',
      (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

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

    // Open I/O Configuration bottom sheet and switch from Inbuilt RGB to Single LED + Save
    await tester.tap(find.text('I/O Configuration'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Inbuilt RGB LED (WS2812)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Single Monochrome GPIO LED').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save I/O & LED Config'));
    await tester.pumpAndSettle();
    expect(state.ioConfigByDevice['DEMO-SEM-001']!.statusLedMode, 'single_gpio');

    // Open Firmware & GitHub FOTA sheet and install update
    await tester.tap(find.text('Firmware & GitHub FOTA'));
    await tester.pumpAndSettle();
    expect(find.text('Install / Update Firmware (v1.3.0)'), findsOneWidget);

    await tester.tap(find.text('Install / Update Firmware (v1.3.0)'));
    await tester.pumpAndSettle();
    expect(state.firmwareByDevice['DEMO-SEM-001']!.updateAvailable, isFalse);
    expect(state.devices.first.firmwareVersion, '1.3.0');
  });
}
