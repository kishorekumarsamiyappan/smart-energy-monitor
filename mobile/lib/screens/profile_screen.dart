import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/constants/app_constants.dart';
import '../core/theme/app_theme.dart';
import '../providers/app_state.dart';
import 'alerts_screen.dart';
import 'login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final user = state.user;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? SemColors.cardDark : SemColors.lightCard;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 46, 16, 30),
      children: [
        // Overlapping Circular Blue Profile Badge on Pale Lavender Card matching Screenshot 3
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 52, 20, 20),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (user?.fullName ?? 'Guest').toUpperCase(),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text('( ${state.isDemoMode ? "Demo User" : (user?.role ?? "User")} )'),
                  const SizedBox(height: 14),
                  _InfoRow(Icons.business_outlined, user?.organization ?? 'Smart Energy Residence'),
                  _InfoRow(Icons.mail_outline, user?.email ?? '-'),
                  _InfoRow(
                    Icons.phone_outlined,
                    (user?.mobileNumber.trim().isNotEmpty ?? false) ? user!.mobileNumber : 'Not set',
                  ),
                  const SizedBox(height: 14),
                  Center(
                    child: Text(
                      'App : ${AppConstants.appVersion}',
                      style: TextStyle(color: SemColors.accentPrimary(context), fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              top: -32,
              left: 16,
              child: Container(
                width: 78,
                height: 78,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(colors: [SemColors.secondary, SemColors.primary]),
                  border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 4),
                ),
                child: ClipOval(
                  child: (user?.avatarUrl != null && user!.avatarUrl!.isNotEmpty)
                      ? Image.network(
                          user.avatarUrl!,
                          fit: BoxFit.cover,
                          width: 78,
                          height: 78,
                          errorBuilder: (_, _, _) => const Icon(Icons.person_rounded, color: Colors.white, size: 42),
                        )
                      : const Icon(Icons.person_rounded, color: Colors.white, size: 42),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _LavenderPillAction(
          icon: isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
          label: 'Theme (${isDark ? "Dark" : "Light"} Mode)',
          color: cardColor,
          onTap: state.toggleTheme,
        ),
        const SizedBox(height: 10),
        _LavenderPillAction(
          icon: Icons.notifications_none_rounded,
          label: 'Alerts & Thresholds (${state.activeAlertsCount} active)',
          color: cardColor,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const AlertsScreen()),
          ),
        ),
        const SizedBox(height: 10),
        _LavenderPillAction(
          icon: Icons.verified_user_outlined,
          label: 'Privacy Policy',
          color: cardColor,
          onTap: () => _showLegalDialog(
            context,
            'Privacy Policy',
            'Row Level Security protects your devices, telemetry, and bills. Wi-Fi & MQTT secrets stay on your ESP32 NVS and hashed server storage.',
          ),
        ),
        const SizedBox(height: 10),
        _LavenderPillAction(
          icon: Icons.description_outlined,
          label: 'Terms & Condition',
          color: cardColor,
          onTap: () => _showLegalDialog(
            context,
            'Terms & Conditions',
            'Smart Energy Monitor provides advisory monitoring and indicative TNEB LT-IA billing estimates only. It does not replace certified utility meters or protective relays.',
          ),
        ),
        const SizedBox(height: 24),
        Center(
          child: SizedBox(
            width: 210,
            child: OutlinedButton(
              onPressed: () async {
                await state.logout();
                if (!context.mounted) return;
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (_) => false,
                );
              },
              child: const Text('Log out'),
            ),
          ),
        ),
      ],
    );
  }

  void _showLegalDialog(BuildContext context, String title, String content) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoRow(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: SemColors.accentSecondary(context)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }
}

class _LavenderPillAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _LavenderPillAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          child: Row(
            children: [
              Icon(icon, color: SemColors.accentSecondary(context)),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
              Icon(Icons.chevron_right_rounded, color: SemColors.accentPrimary(context)),
            ],
          ),
        ),
      ),
    );
  }
}
