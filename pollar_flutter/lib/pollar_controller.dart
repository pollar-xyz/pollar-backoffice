import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'dpop.dart';
import 'models.dart';
import 'session_storage.dart';

enum PollarAuthState {
  uninitialized,
  sessionCreated,
  authenticating,
  authenticated,
  error,
}

class PollarController extends ChangeNotifier {
  final PollarApiClient apiClient;
  final SessionStorage storage;
  final String network;

  PollarAuthState _state = PollarAuthState.uninitialized;
  String? _clientSessionId;
  PersistedSession? _session;
  String? _errorMessage;
  WalletBalance? _walletBalance;
  TxHistory? _txHistory;

  PollarController({
    required this.apiClient,
    required this.storage,
    this.network = 'testnet',
  });

  PollarAuthState get state => _state;
  bool get isAuthenticated => _state == PollarAuthState.authenticated;
  bool get isLoading => _state == PollarAuthState.authenticating;
  String? get walletAddress => _session?.wallet.address;
  String? get walletPublicKey => _session?.wallet.publicKey;
  WalletInfo? get wallet => _session?.wallet;
  UserData? get userData => _session?.data;
  String? get errorMessage => _errorMessage;
  PersistedSession? get session => _session;
  WalletBalance? get walletBalance => _walletBalance;
  TxHistory? get txHistory => _txHistory;
  String? get clientSessionId => _clientSessionId;

  void _setState(PollarAuthState newState) {
    _state = newState;
    notifyListeners();
  }

  void _setError(String message) {
    _errorMessage = message;
    _setState(PollarAuthState.error);
  }

  // -- Initialization --

  Future<void> initialize() async {
    _setState(PollarAuthState.authenticating);
    try {
      final savedSession = await storage.loadSession();
      if (savedSession != null && !savedSession.isTokenExpired) {
        apiClient.setAccessToken(savedSession.token.accessToken);
        _session = savedSession;

        final dpopSeed = await storage.loadDpopSeed();
        if (dpopSeed != null) {
          final material = await DPoPProvider.keyMaterialFromSeed(dpopSeed);
          apiClient.injectKeyMaterial(material);
        }

        _setState(PollarAuthState.authenticated);
      } else if (savedSession != null && savedSession.isTokenExpired) {
        try {
          final refreshed =
              await apiClient.refreshToken(savedSession.token.refreshToken);
          final newSession = PersistedSession(
            clientSessionId: savedSession.clientSessionId,
            userId: savedSession.userId,
            status: 'active',
            token: refreshed.token,
            user: savedSession.user,
            wallet: savedSession.wallet,
            data: savedSession.data,
          );
          _session = newSession;
          await storage.saveSession(newSession);
          _setState(PollarAuthState.authenticated);
        } catch (_) {
          await storage.deleteAll();
          _setState(PollarAuthState.uninitialized);
        }
      } else {
        _setState(PollarAuthState.uninitialized);
      }
    } catch (e) {
      _setError('Failed to initialize: $e');
    }
  }

  // -- Email OTP Flow --

  Future<String> beginEmailLogin() async {
    _setState(PollarAuthState.authenticating);
    try {
      _clientSessionId = await apiClient.createSession();
      _setState(PollarAuthState.sessionCreated);
      return _clientSessionId!;
    } catch (e) {
      _setError('Failed to create session: $e');
      rethrow;
    }
  }

  Future<void> sendEmailCode(String email) async {
    if (_clientSessionId == null) {
      throw PollarException(
        code: 'NO_SESSION',
        message: 'Call beginEmailLogin first',
      );
    }
    try {
      await apiClient.sendEmailCode(
        clientSessionId: _clientSessionId!,
        email: email,
      );
    } catch (e) {
      _setError('Failed to send code: $e');
      rethrow;
    }
  }

  Future<void> verifyEmailCode(String code) async {
    if (_clientSessionId == null) {
      throw PollarException(
        code: 'NO_SESSION',
        message: 'Call beginEmailLogin first',
      );
    }
    try {
      await apiClient.verifyEmailCode(
        clientSessionId: _clientSessionId!,
        code: code,
      );
      await _pollAndLogin();
    } catch (e) {
      _setError('Failed to verify code: $e');
      rethrow;
    }
  }

  // -- OAuth Flow --

  Future<String> beginOAuth(String provider, String redirectUri) async {
    _setState(PollarAuthState.authenticating);
    try {
      _clientSessionId = await apiClient.createSession();
      _setState(PollarAuthState.sessionCreated);
      return apiClient.oauthUrl(provider, _clientSessionId!, redirectUri);
    } catch (e) {
      _setError('Failed to start OAuth: $e');
      rethrow;
    }
  }

  Future<void> completeOAuth() async {
    await _pollAndLogin();
  }

  // -- Token Exchange --

  Future<void> _pollAndLogin() async {
    final sessionId = _clientSessionId;
    if (sessionId == null) return;

    for (int i = 0; i < 60; i++) {
      try {
        final status = await apiClient.pollSessionStatus(sessionId);
        if (status.isReady) {
          final persisted = await apiClient.login(
            clientSessionId: sessionId,
            deviceLabel: 'Flutter',
          );

          _session = persisted;
          await storage.saveSession(persisted);

          final km = await apiClient.getOrCreateKeyMaterial();
          await storage.saveDpopSeed(km.seed);

          _setState(PollarAuthState.authenticated);
          return;
        }
      } catch (_) {
        // Continue polling
      }
      await Future.delayed(const Duration(seconds: 1));
    }

    _setError('Session timed out');
  }

  // -- Balance --

  Future<WalletBalance> refreshBalance() async {
    try {
      _walletBalance = await apiClient.getBalance();
      notifyListeners();
      return _walletBalance!;
    } catch (e) {
      _setError('Failed to fetch balance: $e');
      rethrow;
    }
  }

  // -- Transaction Operations --

  Future<BuildTxResponse> buildTx({
    required String operation,
    required Map<String, dynamic> params,
    Map<String, dynamic>? options,
  }) async {
    final address = walletAddress;
    if (address == null) {
      throw PollarException(code: 'NO_WALLET', message: 'Wallet not available');
    }
    return await apiClient.buildTx(
      address: address,
      operation: operation,
      params: params,
      options: options,
    );
  }

  Future<TxResult> signAndSubmitTx(String unsignedXdr) async {
    final address = walletAddress;
    if (address == null) {
      throw PollarException(code: 'NO_WALLET', message: 'Wallet not available');
    }
    return await apiClient.signAndSubmitTx(
      address: address,
      unsignedXdr: unsignedXdr,
    );
  }

  Future<TxResult> runTx({
    required String operation,
    required Map<String, dynamic> params,
    Map<String, dynamic>? options,
  }) async {
    final buildResp = await buildTx(
      operation: operation,
      params: params,
      options: options,
    );
    return await signAndSubmitTx(buildResp.unsignedXdr);
  }

  // -- History --

  Future<TxHistory> refreshHistory({int? limit, int? offset}) async {
    try {
      _txHistory = await apiClient.getTxHistory(limit: limit, offset: offset);
      notifyListeners();
      return _txHistory!;
    } catch (e) {
      _setError('Failed to fetch history: $e');
      rethrow;
    }
  }

  // -- Logout --

  Future<void> logout() async {
    try {
      await apiClient.logout();
    } catch (_) {
      // best-effort
    }
    await storage.deleteAll();
    _session = null;
    _clientSessionId = null;
    _walletBalance = null;
    _txHistory = null;
    _errorMessage = null;
    _setState(PollarAuthState.uninitialized);
  }

  // -- Error --

  void clearError() {
    _errorMessage = null;
    if (_state == PollarAuthState.error) {
      _setState(
        _session != null
            ? PollarAuthState.authenticated
            : PollarAuthState.uninitialized,
      );
    }
  }
}
