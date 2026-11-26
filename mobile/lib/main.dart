import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'providers/app_state.dart';
import 'screens/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState()..initialize(),
      child: const SmartEnergyMonitorApp(),
    ),
  );
}

class SmartEnergyMonitorApp extends StatelessWidget {
  const SmartEnergyMonitorApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeMode = context.select<AppState, ThemeMode>((s) => s.themeMode);
    return MaterialApp(
      title: 'Smart Energy Monitor',
      debugShowCheckedModeBanner: false,
      theme: SemTheme.light(),
      darkTheme: SemTheme.dark(),
      themeMode: themeMode,
      home: const SplashScreen(),
    );
  }
}
