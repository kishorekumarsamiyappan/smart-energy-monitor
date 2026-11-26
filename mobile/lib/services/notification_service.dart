import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidInit);
    try {
      await _plugin.initialize(settings);
      _initialized = true;
    } catch (_) {
      // Safe fallback in headless test environments
    }
  }

  static Future<void> showElectricalAlert({
    required int id,
    required String title,
    required String body,
  }) async {
    if (!_initialized) {
      await initialize();
    }
    if (!_initialized) return;
    const androidDetails = AndroidNotificationDetails(
      'sem_alerts_channel',
      'Smart Energy Alerts',
      channelDescription: 'Advisory electrical threshold and device offline notifications',
      importance: Importance.high,
      priority: Priority.high,
    );
    await _plugin.show(id, title, body, const NotificationDetails(android: androidDetails));
  }
}
