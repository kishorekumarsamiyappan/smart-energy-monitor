import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';
import '../services/api_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _identifierCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();
  final _api = ApiService();

  bool _submitting = false;
  bool _stepTwo = false;
  bool _obscure = true;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _identifierCtrl.dispose();
    _tokenCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestToken() async {
    final identifier = _identifierCtrl.text.trim();
    if (identifier.isEmpty) {
      setState(() => _error = 'Please enter your registered email or mobile number.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
      _message = null;
    });
    try {
      final res = await _api.request(
        'POST',
        '/auth/forgot-password',
        body: {'identifier': identifier},
      );
      final previewToken = res['previewResetToken']?.toString();
      if (!mounted) return;
      setState(() {
        _stepTwo = true;
        if (previewToken != null && previewToken.isNotEmpty) {
          _tokenCtrl.text = previewToken;
          _message = 'Reset token generated. Enter your new password below.';
        } else {
          _message = res['message']?.toString() ??
              'If that account exists, enter your reset token and new password below.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _submitReset() async {
    final token = _tokenCtrl.text.trim();
    final newPass = _newPassCtrl.text;
    final confirmPass = _confirmPassCtrl.text;

    if (token.isEmpty) {
      setState(() => _error = 'Please enter the reset token.');
      return;
    }
    if (newPass.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters.');
      return;
    }
    if (newPass != confirmPass) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _message = null;
    });
    try {
      final res = await _api.request(
        'POST',
        '/auth/reset-password',
        body: {'token': token, 'newPassword': newPass},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res['message']?.toString() ?? 'Password reset successfully. Please sign in.'),
          backgroundColor: const Color(0xFF1E8E3E),
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset Password')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _stepTwo ? 'Set a New Password' : 'Forgot Your Password?',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  _stepTwo
                      ? 'Confirm your reset token and choose a new password (min 8 characters).'
                      : 'Enter the email or mobile number registered with your SEM account.',
                  style: TextStyle(fontSize: 13, color: SemColors.mutedText(context)),
                ),
                const SizedBox(height: 16),
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFD93025).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xFFD93025), fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (_message != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E8E3E).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _message!,
                      style: const TextStyle(color: Color(0xFF1E8E3E), fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (!_stepTwo) ...[
                  TextField(
                    controller: _identifierCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Email or Mobile Number',
                      prefixIcon: Icon(Icons.mail_outline),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _submitting ? null : _requestToken,
                    child: Text(_submitting ? 'Sending...' : 'Request Reset Token'),
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      _stepTwo = true;
                      _error = null;
                    }),
                    child: const Text('Already have a reset token?'),
                  ),
                ] else ...[
                  TextField(
                    controller: _tokenCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Reset Token',
                      prefixIcon: Icon(Icons.key),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _newPassCtrl,
                    obscureText: _obscure,
                    decoration: InputDecoration(
                      labelText: 'New Password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _confirmPassCtrl,
                    obscureText: _obscure,
                    decoration: const InputDecoration(
                      labelText: 'Confirm New Password',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _submitting ? null : _submitReset,
                    child: Text(_submitting ? 'Resetting...' : 'Reset Password'),
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      _stepTwo = false;
                      _error = null;
                    }),
                    child: const Text('Back to Email / Mobile'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
