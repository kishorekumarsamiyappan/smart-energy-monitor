class AppConstants {
  static const String appName = 'Smart Energy Monitor';
  static const String appVersion = 'V1.0.0 (100)';
  static const String defaultApiBaseUrl = String.fromEnvironment(
    'SEM_API_URL',
    defaultValue: 'http://10.0.2.2:4000/api',
  );
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
  static const int staleTelemetrySeconds = 120;

  static bool get isSupabaseConfigured =>
      supabaseUrl.isNotEmpty &&
      supabaseAnonKey.isNotEmpty &&
      !supabaseUrl.contains('your-project-ref');
}
