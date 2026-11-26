import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/add_device_screen.dart';

void main() {
  testWidgets('Phase 7 AddDeviceScreen pairs a new manual device into Demo state', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const AddDeviceScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('1. Nearby ESP32-S3 (BLE)'), findsOneWidget);
    expect(find.text('Scan BLE'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Device ID (e.g. DEVICE001)'), 'ESP32_NEW_01');
    await tester.enterText(find.widgetWithText(TextField, 'Device Name (e.g. Main Home DB)'), 'Kitchen Panel');

    await tester.scrollUntilVisible(
      find.text('Save & Verify Connection'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save & Verify Connection'));
    await tester.pumpAndSettle();

    expect(state.devices.any((d) => d.deviceId == 'ESP32_NEW_01'), isTrue);
  });
}
