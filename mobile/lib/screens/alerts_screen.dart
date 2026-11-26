import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/time_utils.dart';
import '../providers/app_state.dart';
import '../services/notification_service.dart';
import '../widgets/sem_widgets.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Scaffold(
      appBar: AppBar(title: const Text('Alerts & Notifications')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: SemColors.error.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: SemColors.error.withValues(alpha: 0.35)),
            ),
            child: const Text(
              'Advisory Monitoring Only: Alerts do not act as a circuit breaker or electrical protection relay.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            icon: const Icon(Icons.notifications_active_outlined),
            label: const Text('Test Android Local Notification'),
            onPressed: () => NotificationService.showElectricalAlert(
              id: 1001,
              title: 'Smart Energy Monitor Alert',
              body: 'Sample advisory electrical threshold alert notification.',
            ),
          ),
          const SizedBox(height: 14),
          for (final a in state.alerts) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(a.alertType.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
                        SemStatusBadge(
                          label: a.status.toUpperCase(),
                          color: a.status == 'acknowledged' ? SemColors.success : SemColors.warning,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(a.message),
                    const SizedBox(height: 4),
                    Text(
                      '${a.deviceId} • ${IstTimeUtils.formatDateTimeIst(a.createdAt)}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    if (a.status == 'active')
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () => state.acknowledgeAlert(a.id),
                          child: const Text('Acknowledge'),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}
