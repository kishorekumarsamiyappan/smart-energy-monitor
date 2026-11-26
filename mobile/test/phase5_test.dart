import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_energy_monitor/core/theme/app_theme.dart';
import 'package:smart_energy_monitor/providers/app_state.dart';
import 'package:smart_energy_monitor/screens/history_screen.dart';
import 'package:smart_energy_monitor/services/report_export_service.dart';

void main() {
  testWidgets('Phase 5 HistoryScreen renders 6 metric tabs and summary stats', (tester) async {
    SharedPreferences.setMockInitialValues({'sem_demo_mode': true});
    final state = AppState();
    await state.initialize();

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: SemTheme.light(),
          home: const Scaffold(body: HistoryScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Voltage'), findsOneWidget);
    expect(find.text('Current'), findsOneWidget);
    expect(find.text('Power'), findsOneWidget);
    expect(find.text('Energy'), findsOneWidget);
    expect(find.text('PF'), findsOneWidget);
    expect(find.text('Frequency'), findsOneWidget);
    expect(find.text('Total kWh'), findsOneWidget);

    await tester.tap(find.text('Frequency'));
    await tester.pumpAndSettle();

    final csv = ReportExportService.buildTelemetryCsv(
      'DEMO-SEM-001',
      state.historyByDevice['DEMO-SEM-001']!,
    );
    expect(csv, contains('Timestamp (Asia/Kolkata)'));
    expect(csv, contains('DEMO-SEM-001'));
  });
}
