import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models.dart';

class SessionStorage {
  final FlutterSecureStorage _storage;
  final String apiKeyHash;

  SessionStorage({
    required this.apiKeyHash,
    FlutterSecureStorage? storage,
  }) : _storage = storage ?? const FlutterSecureStorage();

  String get _sessionKey => 'pollar:$apiKeyHash:session';
  String get _walletTypeKey => 'pollar:$apiKeyHash:walletType';
  String get _dpopSeedKey => 'pollar:$apiKeyHash:dpopSeed';

  Future<void> saveSession(PersistedSession session) async {
    await _storage.write(
      key: _sessionKey,
      value: jsonEncode(session.toJson()),
    );
  }

  Future<PersistedSession?> loadSession() async {
    final value = await _storage.read(key: _sessionKey);
    if (value == null) return null;
    try {
      return PersistedSession.fromJson(
        jsonDecode(value) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteSession() async {
    await _storage.delete(key: _sessionKey);
  }

  Future<void> saveDpopSeed(List<int> seed) async {
    await _storage.write(
      key: _dpopSeedKey,
      value: _b64Encode(seed),
    );
  }

  Future<List<int>?> loadDpopSeed() async {
    final value = await _storage.read(key: _dpopSeedKey);
    if (value == null) return null;
    try {
      return base64Url.decode(_pad(value));
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteDpopSeed() async {
    await _storage.delete(key: _dpopSeedKey);
  }

  Future<void> saveWalletType(String type) async {
    await _storage.write(key: _walletTypeKey, value: type);
  }

  Future<String?> loadWalletType() async {
    return await _storage.read(key: _walletTypeKey);
  }

  Future<void> deleteAll() async {
    await Future.wait([
      deleteSession(),
      deleteDpopSeed(),
      _storage.delete(key: _walletTypeKey),
    ]);
  }

  static String _b64Encode(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  static String _pad(String value) {
    switch (value.length % 4) {
      case 2:
        return '$value==';
      case 3:
        return '$value=';
      default:
        return value;
    }
  }

  static String computeApiKeyHash(String apiKey) {
    // For storage key namespacing — a simple length-based hash is sufficient.
    return apiKey.length.toString();
  }
}
