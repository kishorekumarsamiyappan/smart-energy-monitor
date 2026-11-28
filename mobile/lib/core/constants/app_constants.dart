class AppConstants {
  static const String appName = 'SEM';
  static const String appVersion = 'V1.0.0 (100)';
  static const String defaultApiBaseUrl = String.fromEnvironment(
    'SEM_API_URL',
    defaultValue: 'https://smart-energy-monitor-api.smart-energy-monitor.workers.dev/api',
  );
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
  static const int staleTelemetrySeconds = 45;
  static const int defaultTelemetryIntervalSeconds = 10;
  static const int mqttKeepaliveSeconds = 20;
  static const int livePollSeconds = 10;

  static bool get isSupabaseConfigured =>
      supabaseUrl.isNotEmpty &&
      supabaseAnonKey.isNotEmpty &&
      !supabaseUrl.contains('your-project-ref');
}
