import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  String? _message;
  String? _error;
  bool _sending = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _message = null;
      _error = null;
      _sending = true;
    });
    try {
      final res = await ApiService().request('POST', '/auth/forgot-password', body: {
        'email': _emailCtrl.text.trim(),
      });
      setState(() => _message = res['message']?.toString() ?? 'Reset email requested.');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot Password')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Enter your registered email address to reset your password.'),
                const SizedBox(height: 14),
                TextField(
                  controller: _emailCtrl,
                  decoration: const InputDecoration(labelText: 'Email Address', prefixIcon: Icon(Icons.mail_outline)),
                ),
                const SizedBox(height: 14),
                if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                if (_message != null) Text(_message!, style: const TextStyle(color: Colors.green)),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: _sending ? null : _send,
                  child: Text(_sending ? 'Sending...' : 'Send Reset Link'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
