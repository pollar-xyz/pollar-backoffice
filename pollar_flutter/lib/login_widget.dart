import 'package:flutter/material.dart';

import 'pollar_controller.dart';
import 'pollar_provider.dart';

class LoginButton extends StatelessWidget {
  final String label;
  final double? width;
  final double? height;

  const LoginButton({
    super.key,
    this.label = 'Sign in with Pollar',
    this.width,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    final controller = PollarProvider.of(context);
    return SizedBox(
      width: width ?? double.infinity,
      height: height ?? 48,
      child: ElevatedButton(
        onPressed: () => _showLoginModal(context, controller),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF0560A9),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
      ),
    );
  }

  void _showLoginModal(BuildContext context, PollarController controller) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const Padding(
        padding: EdgeInsets.all(24),
        child: LoginOptionsPanel(),
      ),
    );
  }
}

class LoginOptionsPanel extends StatelessWidget {
  const LoginOptionsPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = PollarProvider.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Sign in with Pollar',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        const Text(
          'Choose how to connect your wallet',
          style: TextStyle(color: Colors.grey),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        _ProviderButton(
          label: 'Continue with Google',
          icon: Icons.g_mobiledata,
          onTap: () => _startOAuth(context, controller, 'google'),
        ),
        const SizedBox(height: 12),
        _ProviderButton(
          label: 'Continue with GitHub',
          icon: Icons.code,
          onTap: () => _startOAuth(context, controller, 'github'),
        ),
        const SizedBox(height: 12),
        _ProviderButton(
          label: 'Continue with Email',
          icon: Icons.email_outlined,
          onTap: () => _showEmailLogin(context, controller),
        ),
        const SizedBox(height: 24),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }

  void _startOAuth(
      BuildContext context, PollarController controller, String provider) {
    // OAuth via flutter_web_auth_2 would go here.
    // This requires the app to handle the callback URL.
    // See README for platform configuration.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'OAuth via $provider requires deep link setup. '
          'Use email login for testing.',
        ),
      ),
    );
  }

  void _showEmailLogin(BuildContext context, PollarController controller) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => EmailLoginPage(controller: controller),
      ),
    );
  }
}

class _ProviderButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _ProviderButton({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        side: BorderSide(color: Colors.grey.shade300),
      ),
    );
  }
}

class EmailLoginPage extends StatefulWidget {
  final PollarController controller;

  const EmailLoginPage({super.key, required this.controller});

  @override
  State<EmailLoginPage> createState() => _EmailLoginPageState();
}

class _EmailLoginPageState extends State<EmailLoginPage> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.controller.beginEmailLogin();
      await widget.controller.sendEmailCode(email);
      setState(() {
        _codeSent = true;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.controller.verifyEmailCode(code);
      if (mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Email Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!_codeSent) ...[
              TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loading ? null : _sendCode,
                child: _loading
                    ? const CircularProgressIndicator()
                    : const Text('Send Code'),
              ),
            ] else ...[
              TextField(
                controller: _codeController,
                decoration: const InputDecoration(
                  labelText: 'Verification Code',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loading ? null : _verifyCode,
                child: _loading
                    ? const CircularProgressIndicator()
                    : const Text('Verify & Sign In'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
