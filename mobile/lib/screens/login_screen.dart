import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/constants/app_constants.dart';
import '../core/theme/app_theme.dart';
import '../models/models.dart';
import '../providers/app_state.dart';
import '../widgets/brand_logo.dart';
import 'forgot_password_screen.dart';
import 'main_shell_screen.dart';
import 'register_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifierCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _otpEmailCtrl = TextEditingController();
  final _otpCodeCtrl = TextEditingController();

  StreamSubscription<Uri>? _linkSub;
  bool _obscure = true;
  bool _loading = false;
  bool _otpLoginMode = false;
  UserProfile? _googlePendingUser;
  String? _otpToken;
  String? _otpNotice;
  String? _previewOtp;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initDeepLinks();
  }

  void _initDeepLinks() {
    try {
      final appLinks = AppLinks();
      _linkSub = appLinks.uriLinkStream.listen(_handleAuthCallbackUri, onError: (_) {});
    } catch (_) {
      // Ignore in widget tests where platform channels are unavailable
    }
  }

  Future<void> _handleAuthCallbackUri(Uri uri) async {
    if (uri.scheme != 'sem' || uri.host != 'auth-callback') return;
    final fragParams = Uri.splitQueryString(uri.fragment);
    final errParam = fragParams['error'] ?? uri.queryParameters['error'];
    final accessToken = fragParams['access_token'];

    if (!mounted) return;
    if (errParam != null && errParam.isNotEmpty) {
      setState(() {
        _loading = false;
        _error = errParam == 'google_not_configured'
            ? 'Enable Google Provider in Supabase Dashboard -> Authentication -> Providers and allow redirect https://smart-energy-monitor-api.smart-energy-monitor.workers.dev/api/auth/google/callback**.'
            : errParam;
      });
      return;
    }
    if (accessToken == null || accessToken.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'No Google OAuth token received.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await context.read<AppState>().exchangeGoogleToken(supabaseAccessToken: accessToken);
      if (!mounted) return;
      final userJson = res['user'] as Map<String, dynamic>?;
      setState(() {
        _googlePendingUser = userJson != null ? UserProfile.fromJson(userJson) : null;
        _otpEmailCtrl.text = _googlePendingUser?.email ?? '';
        _otpToken = res['otpToken']?.toString();
        _otpNotice = res['message']?.toString();
        _previewOtp = res['previewOtp']?.toString();
        _otpLoginMode = true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    _identifierCtrl.dispose();
    _passwordCtrl.dispose();
    _otpEmailCtrl.dispose();
    _otpCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_identifierCtrl.text.trim().isEmpty || _passwordCtrl.text.isEmpty) {
      setState(() => _error = 'Enter your email or mobile number and password.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().login(_identifierCtrl.text.trim(), _passwordCtrl.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainShellScreen()),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startGoogleSignIn() async {
    setState(() => _error = null);
    final url = Uri.parse(
      '${AppConstants.defaultApiBaseUrl}/auth/google/start?redirect_to=${Uri.encodeComponent('sem://auth-callback')}',
    );
    try {
      final launched = await launchUrl(url, mode: LaunchMode.externalApplication);
      if (!launched && mounted) {
        setState(() => _error = 'Could not open browser for Google sign-in.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _sendOtp() async {
    setState(() {
      _error = null;
      _otpNotice = null;
    });
    final email = _otpEmailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await context.read<AppState>().sendEmailOtp(email);
      if (!mounted) return;
      setState(() {
        _otpToken = res['otpToken']?.toString();
        _otpNotice = res['message']?.toString();
        _previewOtp = res['previewOtp']?.toString();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    if (_otpToken == null) return;
    setState(() => _error = null);
    if (_otpCodeCtrl.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit OTP code.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().verifyEmailOtp(
            email: _otpEmailCtrl.text.trim(),
            code: _otpCodeCtrl.text.trim(),
            otpToken: _otpToken!,
          );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainShellScreen()),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accentIcon = SemColors.accentSecondary(context);
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight - 40),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
                          color: SemColors.primary,
                          child: const Column(
                            children: [
                              BrandLogo(lightOnDark: true),
                              SizedBox(height: 12),
                              Text(
                                'Welcome Back',
                                style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Sign in to monitor your ESP32-S3 meters',
                                style: TextStyle(color: Colors.white70, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (_error != null)
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  margin: const EdgeInsets.only(bottom: 14),
                                  decoration: BoxDecoration(
                                    color: SemColors.error.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    _error!,
                                    style: const TextStyle(color: SemColors.error, fontWeight: FontWeight.w600, fontSize: 13),
                                  ),
                                ),
                              if (_googlePendingUser != null)
                                Container(
                                  margin: const EdgeInsets.only(bottom: 14),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Theme.of(context).brightness == Brightness.dark
                                        ? SemColors.surfaceDark
                                        : SemColors.lightCard,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Row(
                                    children: [
                                      ClipOval(
                                        child: (_googlePendingUser!.avatarUrl != null &&
                                                _googlePendingUser!.avatarUrl!.isNotEmpty)
                                            ? Image.network(
                                                _googlePendingUser!.avatarUrl!,
                                                width: 46,
                                                height: 46,
                                                fit: BoxFit.cover,
                                                errorBuilder: (_, _, _) => CircleAvatar(
                                                  backgroundColor: SemColors.primary,
                                                  child: Text(
                                                    _googlePendingUser!.fullName.substring(0, 1).toUpperCase(),
                                                    style: const TextStyle(color: Colors.white),
                                                  ),
                                                ),
                                              )
                                            : CircleAvatar(
                                                backgroundColor: SemColors.primary,
                                                child: Text(
                                                  _googlePendingUser!.fullName.substring(0, 1).toUpperCase(),
                                                  style: const TextStyle(color: Colors.white),
                                                ),
                                              ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(_googlePendingUser!.fullName,
                                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                                            Text(_googlePendingUser!.email,
                                                style: TextStyle(fontSize: 12, color: SemColors.mutedText(context))),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              if (!_otpLoginMode) ...[
                                TextField(
                                  controller: _identifierCtrl,
                                  decoration: InputDecoration(
                                    labelText: 'Email or Mobile Number',
                                    prefixIcon: Icon(Icons.mail_outline, color: accentIcon),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                TextField(
                                  controller: _passwordCtrl,
                                  obscureText: _obscure,
                                  decoration: InputDecoration(
                                    labelText: 'Password',
                                    prefixIcon: Icon(Icons.lock_outline, color: accentIcon),
                                    suffixIcon: IconButton(
                                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                      onPressed: () => setState(() => _obscure = !_obscure),
                                    ),
                                  ),
                                ),
                                Wrap(
                                  alignment: WrapAlignment.spaceBetween,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  spacing: 4,
                                  children: [
                                    TextButton(
                                      onPressed: () => setState(() {
                                        _otpLoginMode = true;
                                        _error = null;
                                      }),
                                      child: const Text('Sign in with OTP'),
                                    ),
                                    TextButton(
                                      onPressed: () => Navigator.of(context).push(
                                        MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()),
                                      ),
                                      child: const Text('Forgot password?'),
                                    ),
                                  ],
                                ),
                                ElevatedButton(
                                  onPressed: _loading ? null : _submit,
                                  child: Text(_loading ? 'Signing in...' : 'Login'),
                                ),
                              ] else ...[
                                TextField(
                                  controller: _otpEmailCtrl,
                                  keyboardType: TextInputType.emailAddress,
                                  decoration: InputDecoration(
                                    labelText: 'Email Address for OTP',
                                    prefixIcon: Icon(Icons.mail_outline, color: accentIcon),
                                  ),
                                ),
                                if (_otpNotice != null) ...[
                                  const SizedBox(height: 10),
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: SemColors.success.withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(_otpNotice!, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                                        if (_previewOtp != null)
                                          Text('Preview OTP: $_previewOtp',
                                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                                      ],
                                    ),
                                  ),
                                ],
                                if (_otpToken != null) ...[
                                  const SizedBox(height: 12),
                                  TextField(
                                    controller: _otpCodeCtrl,
                                    keyboardType: TextInputType.number,
                                    maxLength: 6,
                                    decoration: InputDecoration(
                                      labelText: '6-Digit OTP Code',
                                      counterText: '',
                                      prefixIcon: Icon(Icons.verified_user_outlined, color: accentIcon),
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 14),
                                ElevatedButton(
                                  onPressed: _loading ? null : (_otpToken != null ? _verifyOtp : _sendOtp),
                                  child: Text(_loading
                                      ? 'Please wait...'
                                      : (_otpToken != null ? 'Verify OTP & Sign In' : 'Send Verification OTP')),
                                ),
                                if (_otpToken != null)
                                  TextButton(
                                    onPressed: _loading ? null : _sendOtp,
                                    child: const Text('Resend OTP'),
                                  ),
                                TextButton(
                                  onPressed: () => setState(() {
                                    _otpLoginMode = false;
                                    _googlePendingUser = null;
                                    _otpToken = null;
                                    _error = null;
                                  }),
                                  child: const Text('Back to Password Login'),
                                ),
                              ],
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                icon: const Icon(Icons.g_mobiledata_rounded, size: 26),
                                label: const Text('Continue with Google'),
                                onPressed: _loading ? null : _startGoogleSignIn,
                              ),
                              const SizedBox(height: 12),
                              OutlinedButton.icon(
                                icon: const Icon(Icons.play_circle_outline, color: SemColors.warning),
                                label: const Text(
                                  'Try Interactive Demo Mode',
                                  style: TextStyle(color: SemColors.warning, fontWeight: FontWeight.w700),
                                ),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: SemColors.warning, width: 1.5),
                                ),
                                onPressed: () async {
                                  await context.read<AppState>().enterDemoMode();
                                  if (!context.mounted) return;
                                  Navigator.of(context).pushReplacement(
                                    MaterialPageRoute(builder: (_) => const MainShellScreen()),
                                  );
                                },
                              ),
                              const SizedBox(height: 14),
                              Wrap(
                                alignment: WrapAlignment.center,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  const Text('New user? '),
                                  TextButton(
                                    onPressed: () => Navigator.of(context).push(
                                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                                    ),
                                    child: const Text('Create Account'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
