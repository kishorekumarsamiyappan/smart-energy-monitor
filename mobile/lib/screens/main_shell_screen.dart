import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../providers/app_state.dart';
import '../widgets/brand_logo.dart';
import '../widgets/sem_widgets.dart';
import 'add_device_screen.dart';
import 'alerts_screen.dart';
import 'billing_screen.dart';
import 'dashboard_screen.dart';
import 'devices_screen.dart';
import 'history_screen.dart';
import 'login_screen.dart';
import 'monitoring_screen.dart';
import 'profile_screen.dart';

class MainShellScreen extends StatefulWidget {
  const MainShellScreen({super.key});

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    final bodyContent = switch (_tabIndex) {
      0 => DashboardScreen(
          onOpenMonitoring: () => setState(() => _tabIndex = 1),
          onOpenBilling: () => setState(() => _tabIndex = 3),
        ),
      1 => const MonitoringScreen(),
      2 => const HistoryScreen(),
      3 => const BillingScreen(),
      4 => DevicesScreen(
            onAddDevice: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AddDeviceScreen()),
            ),
          ),
      _ => const SizedBox.shrink(),
    };

    final avatarUrl = state.user?.avatarUrl;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: _tabIndex == 1
          ? null
          : AppBar(
              title: const BrandLogo(lightOnDark: true),
              actions: [
                if (state.isDemoMode)
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: SemColors.warning,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text('DEMO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                  ),
                IconButton(
                  icon: Icon(state.themeMode == ThemeMode.dark ? Icons.light_mode : Icons.dark_mode),
                  onPressed: state.toggleTheme,
                ),
                IconButton(
                  icon: Badge(
                    isLabelVisible: state.activeAlertsCount > 0,
                    label: Text('${state.activeAlertsCount}'),
                    child: const Icon(Icons.notifications_none_rounded),
                  ),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AlertsScreen()),
                  ),
                ),
                IconButton(
                  tooltip: 'Profile',
                  icon: (avatarUrl != null && avatarUrl.isNotEmpty)
                      ? Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: SemColors.warning, width: 1.5),
                          ),
                          child: ClipOval(
                            child: Image.network(
                              avatarUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const Icon(Icons.person_outline_rounded, size: 20),
                            ),
                          ),
                        )
                      : const Icon(Icons.person_outline_rounded),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => Scaffold(
                        appBar: AppBar(title: const Text('Profile')),
                        body: const ProfileScreen(),
                      ),
                    ),
                  ),
                ),
              ],
            ),
      body: Column(
        children: [
          if (state.isDemoMode && _tabIndex != 1)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              color: SemColors.warning.withValues(alpha: 0.15),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Demo Mode Active — Simulated single-phase data only.',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      await state.logout();
                      if (!context.mounted) return;
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    },
                    child: const Text('Exit'),
                  ),
                ],
              ),
            ),
          Expanded(child: bodyContent),
        ],
      ),
      floatingActionButton: _tabIndex == 0
          ? TiltedAddFab(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const AddDeviceScreen()),
              ),
            )
          : null,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: isDark ? SemColors.dividerDark : SemColors.borderLight,
              width: 1,
            ),
          ),
        ),
        child: NavigationBar(
          height: 66,
          backgroundColor: isDark ? SemColors.surfaceDark : SemColors.backgroundLight,
          indicatorColor: isDark
              ? SemColors.primaryDark.withValues(alpha: 0.22)
              : SemColors.primary.withValues(alpha: 0.14),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          selectedIndex: _tabIndex.clamp(0, 4),
          onDestinationSelected: (i) => setState(() => _tabIndex = i),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard_rounded),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.monitor_heart_outlined),
              selectedIcon: Icon(Icons.monitor_heart_rounded),
              label: 'Monitor',
            ),
            NavigationDestination(
              icon: Icon(Icons.show_chart_rounded),
              selectedIcon: Icon(Icons.auto_graph_rounded),
              label: 'History',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long_rounded),
              label: 'Billing',
            ),
            NavigationDestination(
              icon: Icon(Icons.memory_outlined),
              selectedIcon: Icon(Icons.memory_rounded),
              label: 'Devices',
            ),
          ],
        ),
      ),
    );
  }
}
