import 'package:flutter/material.dart';
import 'package:pollar_flutter/pollar_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PollarDemoApp());
}

class PollarDemoApp extends StatelessWidget {
  const PollarDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    // ⚠ Replace with your publishable key from https://dashboard.pollar.xyz
    const publishableKey = String.fromEnvironment(
      'POLLAR_PUBLISHABLE_KEY',
      defaultValue: 'pub_testnet_YOUR_KEY_HERE',
    );

    return PollarProvider.create(
      publishableKey: publishableKey,
      child: MaterialApp(
        title: 'Pollar Demo',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorSchemeSeed: const Color(0xFF0560A9),
          useMaterial3: true,
        ),
        home: const WalletScreen(),
      ),
    );
  }
}

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = PollarProvider.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pollar Wallet'),
        actions: [
          if (controller.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () async {
                await controller.logout();
              },
            ),
        ],
      ),
      body: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          if (controller.state == PollarAuthState.authenticating) {
            return const Center(child: CircularProgressIndicator());
          }

          if (controller.state == PollarAuthState.error) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(controller.errorMessage ?? 'Unknown error'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      controller.clearError();
                      controller.initialize();
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          if (!controller.isAuthenticated) {
            return const _NotAuthenticatedView();
          }

          return const _AuthenticatedView();
        },
      ),
    );
  }
}

class _NotAuthenticatedView extends StatelessWidget {
  const _NotAuthenticatedView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.account_balance_wallet_outlined,
                size: 72, color: Color(0xFF0560A9)),
            const SizedBox(height: 24),
            const Text(
              'Pollar Demo',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Connect your wallet to get started',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 32),
            const LoginButton(),
          ],
        ),
      ),
    );
  }
}

class _AuthenticatedView extends StatelessWidget {
  const _AuthenticatedView();

  @override
  Widget build(BuildContext context) {
    final controller = PollarProvider.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Wallet',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (controller.walletAddress != null)
                  SelectableText(
                    controller.walletAddress!,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 12),
                  ),
                if (controller.walletPublicKey != null) ...[
                  const SizedBox(height: 4),
                  SelectableText(
                    controller.walletPublicKey!,
                    style: const TextStyle(
                        fontFamily: 'monospace', fontSize: 12,
                        color: Colors.grey),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Balance',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.refresh, size: 20),
                      onPressed: () => controller.refreshBalance(),
                    ),
                  ],
                ),
                if (controller.walletBalance == null)
                  ElevatedButton(
                    onPressed: () => controller.refreshBalance(),
                    child: const Text('Load Balance'),
                  )
                else
                  ...controller.walletBalance!.balances.map(
                    (b) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${b.code}${b.issuer != null ? ' (${b.issuer!.substring(0, 6)}...)' : ''}'),
                          Text(b.balance,
                              style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        const _SendPaymentCard(),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('History',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.refresh, size: 20),
                      onPressed: () => controller.refreshHistory(),
                    ),
                  ],
                ),
                if (controller.txHistory == null)
                  ElevatedButton(
                    onPressed: () => controller.refreshHistory(),
                    child: const Text('Load History'),
                  )
                else if (controller.txHistory!.records.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No transactions yet',
                        style: TextStyle(color: Colors.grey)),
                  )
                else
                  ...controller.txHistory!.records.take(10).map(
                    (tx) => ListTile(
                      dense: true,
                      title: Text(
                        tx.operation ?? 'Unknown',
                        style: const TextStyle(fontSize: 14),
                      ),
                      subtitle: Text(
                        '${tx.status} • ${tx.createdAt}',
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: Text(
                        '${tx.hash.substring(0, 8)}...',
                        style: const TextStyle(
                            fontFamily: 'monospace', fontSize: 11),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SendPaymentCard extends StatefulWidget {
  const _SendPaymentCard();

  @override
  State<_SendPaymentCard> createState() => _SendPaymentCardState();
}

class _SendPaymentCardState extends State<_SendPaymentCard> {
  final _destinationCtrl = TextEditingController(
    text: 'GBV4ZDEPNQYFKUGJBNJGBPJ2O2I3H3GZQYVJ3QH3QH3QH3QH3QH3QH3',
  );
  final _amountCtrl = TextEditingController(text: '1');
  bool _sending = false;
  String? _result;

  @override
  void dispose() {
    _destinationCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Send Test Payment',
                style:
                    TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            TextField(
              controller: _destinationCtrl,
              decoration: const InputDecoration(
                labelText: 'Destination',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _amountCtrl,
              decoration: const InputDecoration(
                labelText: 'Amount (XLM)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _sending ? null : _sendPayment,
              child: _sending
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Send Payment'),
            ),
            if (_result != null) ...[
              const SizedBox(height: 8),
              SelectableText(
                _result!,
                style: TextStyle(
                  color: _result!.contains('SUCCESS')
                      ? Colors.green
                      : Colors.red,
                  fontSize: 11,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _sendPayment() async {
    final dest = _destinationCtrl.text.trim();
    final amount = _amountCtrl.text.trim();
    if (dest.isEmpty || amount.isEmpty) return;

    setState(() {
      _sending = true;
      _result = null;
    });

    try {
      final controller = PollarProvider.of(context);
      final result = await controller.runTx(
        operation: 'payment',
        params: {
          'destination': dest,
          'amount': amount,
          'asset': 'native',
        },
      );
      setState(() {
        _result = '${result.status}: ${result.hash}';
        _sending = false;
      });
    } catch (e) {
      setState(() {
        _result = 'Error: $e';
        _sending = false;
      });
    }
  }
}
