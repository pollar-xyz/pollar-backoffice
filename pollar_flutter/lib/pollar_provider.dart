import 'package:flutter/material.dart';

import 'api_client.dart';
import 'pollar_controller.dart';
import 'session_storage.dart';

class PollarProvider extends InheritedNotifier<PollarController> {
  PollarProvider({
    super.key,
    required PollarController controller,
    required super.child,
  }) : super(notifier: controller);

  static PollarController of(BuildContext context) {
    final provider =
        context.dependOnInheritedWidgetOfExactType<PollarProvider>();
    assert(provider != null, 'No PollarProvider found in context');
    return provider!.notifier!;
  }

  static PollarController? maybeOf(BuildContext context) {
    final provider =
        context.dependOnInheritedWidgetOfExactType<PollarProvider>();
    return provider?.notifier;
  }

  factory PollarProvider.create({
    Key? key,
    required String publishableKey,
    required Widget child,
    String network = 'testnet',
  }) {
    final apiKeyHash = SessionStorage.computeApiKeyHash(publishableKey);
    final storage = SessionStorage(apiKeyHash: apiKeyHash);
    final apiClient = PollarApiClient(
      apiKey: publishableKey,
      network: network,
    );
    final controller = PollarController(
      apiClient: apiClient,
      storage: storage,
      network: network,
    );
    return PollarProvider(
      key: key,
      controller: controller,
      child: _PollarInit(
        controller: controller,
        child: child,
      ),
    );
  }
}

class _PollarInit extends StatefulWidget {
  final PollarController controller;
  final Widget child;

  const _PollarInit({
    required this.controller,
    required this.child,
  });

  @override
  State<_PollarInit> createState() => _PollarInitState();
}

class _PollarInitState extends State<_PollarInit> {
  @override
  void initState() {
    super.initState();
    widget.controller.initialize();
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
