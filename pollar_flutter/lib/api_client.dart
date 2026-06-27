import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;

import 'dpop.dart';
import 'models.dart';

class PollarApiClient {
  final String baseUrl;
  final String apiKey;
  final String network;
  final http.Client _client;
  DPoPKeyMaterial? _dpopKeyMaterial;
  String? _accessToken;
  String? _dpopNonce;

  PollarApiClient({
    required this.apiKey,
    this.baseUrl = 'https://sdk.api.pollar.xyz/v1',
    this.network = 'testnet',
    http.Client? client,
  }) : _client = client ?? http.Client();

  void dispose() {
    _client.close();
  }

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  void setDpopNonce(String? nonce) {
    _dpopNonce = nonce;
  }

  Future<DPoPKeyMaterial> getOrCreateKeyMaterial() async {
    if (_dpopKeyMaterial == null) {
      _dpopKeyMaterial = await DPoPProvider.generateKeyMaterial();
    }
    return _dpopKeyMaterial!;
  }

  void injectKeyMaterial(DPoPKeyMaterial material) {
    _dpopKeyMaterial = material;
  }

  Future<Map<String, String>> _buildHeaders({
    bool authenticated = false,
    String? method,
    String? url,
  }) async {
    final headers = <String, String>{
      'x-pollar-api-key': apiKey,
      'Content-Type': 'application/json',
    };

    if (authenticated && _accessToken != null && method != null && url != null) {
      final km = await getOrCreateKeyMaterial();
      try {
        final proof = await DPoPProvider.buildProof(
          method: method,
          url: url,
          accessToken: _accessToken,
          keyPair: km.keyPair,
          nonce: _dpopNonce,
        );
        headers['Authorization'] = 'DPoP $_accessToken';
        headers['DPoP'] = proof;
      } catch (_) {
        headers['Authorization'] = 'Bearer $_accessToken';
      }
    } else if (authenticated && _accessToken != null) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }

    return headers;
  }

  Future<T> _handleResponse<T>(
    http.Response response,
    T Function(dynamic) fromContent,
  ) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      _captureDpopNonce(response);
      return PollarApiResponse.fromJson(body, fromContent).content;
    }

    final dpopNonce = response.headers['dpop-nonce'];
    if (dpopNonce != null) {
      _dpopNonce = dpopNonce;
    }

    String code = 'UNKNOWN_ERROR';
    String? message;
    try {
      final errBody = jsonDecode(response.body) as Map<String, dynamic>;
      code = errBody['code'] as String? ?? 'HTTP_${response.statusCode}';
      message = errBody['message'] as String?;
    } catch (_) {
      code = 'HTTP_${response.statusCode}';
    }

    throw PollarException(
      code: code,
      message: message,
      statusCode: response.statusCode,
    );
  }

  void _captureDpopNonce(http.Response response) {
    final nonce = response.headers['dpop-nonce'];
    if (nonce != null && nonce.isNotEmpty) {
      _dpopNonce = nonce;
    }
  }

  String _url(String path) => '$baseUrl$path';

  // -- Auth: Session --

  Future<String> createSession() async {
    final headers = await _buildHeaders();
    final response = await _client.post(
      Uri.parse(_url('/auth/session')),
      headers: headers,
    );
    final content = await _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );
    return content['clientSessionId'] as String;
  }

  Future<SessionStatus> pollSessionStatus(String clientSessionId) async {
    final headers = await _buildHeaders();
    final response = await _client.get(
      Uri.parse(
        _url('/auth/session/status/$clientSessionId/poll'),
      ),
      headers: headers,
    );
    return _handleResponse<SessionStatus>(
      response,
      (d) => SessionStatus.fromJson(d as Map<String, dynamic>),
    );
  }

  Future<PersistedSession> resumeSession() async {
    final headers = await _buildHeaders(
      authenticated: true,
      method: 'GET',
      url: _url('/auth/session/resume'),
    );
    final response = await _client.get(
      Uri.parse(_url('/auth/session/resume')),
      headers: headers,
    );
    return _handleResponse<PersistedSession>(
      response,
      (d) => PersistedSession.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Auth: Email OTP --

  Future<void> sendEmailCode({
    required String clientSessionId,
    required String email,
  }) async {
    final headers = await _buildHeaders();
    final response = await _client.post(
      Uri.parse(_url('/auth/email')),
      headers: headers,
      body: jsonEncode({
        'clientSessionId': clientSessionId,
        'email': email,
      }),
    );
    await _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );
  }

  Future<void> verifyEmailCode({
    required String clientSessionId,
    required String code,
  }) async {
    final headers = await _buildHeaders();
    final response = await _client.post(
      Uri.parse(_url('/auth/email/verify-code')),
      headers: headers,
      body: jsonEncode({
        'clientSessionId': clientSessionId,
        'code': code,
      }),
    );
    await _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );
  }

  // -- Auth: Login (token exchange) --

  Future<PersistedSession> login({
    required String clientSessionId,
    String? deviceLabel,
  }) async {
    final km = await getOrCreateKeyMaterial();
    final headers = await _buildHeaders();
    final response = await _client.post(
      Uri.parse(_url('/auth/login')),
      headers: headers,
      body: jsonEncode({
        'clientSessionId': clientSessionId,
        'dpopJwk': km.jwk,
        if (deviceLabel != null) 'deviceLabel': deviceLabel,
      }),
    );
    final content = await _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );

    final persisted = PersistedSession.fromJson(content);
    _accessToken = persisted.token.accessToken;
    return persisted;
  }

  Future<PersistedSession> refreshToken(String refreshToken) async {
    final km = await getOrCreateKeyMaterial();
    final url = _url('/auth/refresh');
    final proof = await DPoPProvider.buildProof(
      method: 'POST',
      url: url,
      accessToken: null,
      keyPair: km.keyPair,
      nonce: _dpopNonce,
    );

    final response = await _client.post(
      Uri.parse(url),
      headers: {
        'x-pollar-api-key': apiKey,
        'Content-Type': 'application/json',
        'DPoP': proof,
      },
      body: jsonEncode({
        'refreshToken': refreshToken,
      }),
    );

    final content = await _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );

    final token =
        SessionToken.fromJson(content['token'] as Map<String, dynamic>);
    _accessToken = token.accessToken;
    return PersistedSession(
      clientSessionId: '',
      userId: null,
      status: 'active',
      token: token,
      user: null,
      wallet: const WalletInfo(type: 'custodial'),
      data: null,
    );
  }

  // -- Auth: Logout --

  Future<void> logout({bool everywhere = false}) async {
    final headers = await _buildHeaders(
      authenticated: true,
      method: 'POST',
      url: _url('/auth/logout'),
    );
    await _client.post(
      Uri.parse(_url('/auth/logout')),
      headers: headers,
      body: jsonEncode({'everywhere': everywhere}),
    );
    _accessToken = null;
  }

  // -- OAuth URLs --

  String oauthUrl(String provider, String clientSessionId, String redirectUri) {
    return '$baseUrl/auth/$provider'
        '?api_key=$apiKey'
        '&client_session_id=$clientSessionId'
        '&redirect_uri=${Uri.encodeComponent(redirectUri)}';
  }

  // -- Wallet: Balance --

  Future<WalletBalance> getBalance() async {
    final headers = await _buildHeaders(
      authenticated: true,
      method: 'GET',
      url: _url('/wallet/balance'),
    );
    final response = await _client.get(
      Uri.parse(_url('/wallet/balance')),
      headers: headers,
    );
    return _handleResponse<WalletBalance>(
      response,
      (d) => WalletBalance.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Transaction: Build --

  Future<BuildTxResponse> buildTx({
    required String address,
    required String operation,
    required Map<String, dynamic> params,
    Map<String, dynamic>? options,
  }) async {
    final body = BuildTxParams(
      address: address,
      operation: operation,
      params: params,
      options: options,
    ).toJson(network);

    final headers = await _buildHeaders(
      authenticated: true,
      method: 'POST',
      url: _url('/tx/build'),
    );
    final response = await _client.post(
      Uri.parse(_url('/tx/build')),
      headers: headers,
      body: jsonEncode(body),
    );
    return _handleResponse<BuildTxResponse>(
      response,
      (d) => BuildTxResponse.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Transaction: Sign and Submit (atomic custodial) --

  Future<TxResult> signAndSubmitTx({
    required String address,
    required String unsignedXdr,
  }) async {
    final body = {
      'network': network,
      'address': address,
      'unsignedXdr': unsignedXdr,
    };

    final headers = await _buildHeaders(
      authenticated: true,
      method: 'POST',
      url: _url('/tx/build-sign-submit'),
    );
    final response = await _client.post(
      Uri.parse(_url('/tx/build-sign-submit')),
      headers: headers,
      body: jsonEncode(body),
    );
    return _handleResponse<TxResult>(
      response,
      (d) => TxResult.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Transaction: History --

  Future<TxHistory> getTxHistory({int? limit, int? offset}) async {
    final queryParams = <String, String>{
      'network': network,
    };
    if (limit != null) queryParams['limit'] = limit.toString();
    if (offset != null) queryParams['offset'] = offset.toString();

    final uri = Uri.parse(_url('/tx/history'))
        .replace(queryParameters: queryParams);

    final headers = await _buildHeaders(
      authenticated: true,
      method: 'GET',
      url: uri.toString(),
    );
    final response = await _client.get(uri, headers: headers);
    return _handleResponse<TxHistory>(
      response,
      (d) => TxHistory.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Transaction: Status --

  Future<TxResult> getTxStatus(String hash) async {
    final uri = Uri.parse(_url('/tx/status')).replace(queryParameters: {
      'network': network,
      'hash': hash,
    });

    final headers = await _buildHeaders(
      authenticated: true,
      method: 'GET',
      url: uri.toString(),
    );
    final response = await _client.get(uri, headers: headers);
    return _handleResponse<TxResult>(
      response,
      (d) => TxResult.fromJson(d as Map<String, dynamic>),
    );
  }

  // -- Application config --

  Future<Map<String, dynamic>> getAppConfig() async {
    final headers = await _buildHeaders();
    final response = await _client.get(
      Uri.parse(_url('/applications/config')),
      headers: headers,
    );
    return _handleResponse<Map<String, dynamic>>(
      response,
      (d) => d as Map<String, dynamic>,
    );
  }
}
