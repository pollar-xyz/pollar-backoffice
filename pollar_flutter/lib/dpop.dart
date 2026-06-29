import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

class DPoPKeyMaterial {
  final SimpleKeyPair keyPair;
  final List<int> publicKeyBytes;
  final List<int> seed;

  DPoPKeyMaterial({
    required this.keyPair,
    required this.publicKeyBytes,
    required this.seed,
  });

  Map<String, dynamic> get jwk {
    final x = _b64(publicKeyBytes.sublist(1, 33));
    final y = _b64(publicKeyBytes.sublist(33, 65));
    return {'kty': 'EC', 'crv': 'P-256', 'x': x, 'y': y};
  }
}

class DPoPProvider {
  DPoPProvider._();

  static final _alg = Ecdsa.p256(LittleEndianBigIntCryptography());

  static Future<DPoPKeyMaterial> generateKeyMaterial() async {
    final seed = _generateSeed();
    return _fromSeed(seed);
  }

  static Future<DPoPKeyMaterial> keyMaterialFromSeed(List<int> seed) async {
    return _fromSeed(seed);
  }

  static Future<DPoPKeyMaterial> _fromSeed(List<int> seed) async {
    final keyPair = await _alg.newKeyPairFromSeed(seed);
    final data = await keyPair.extract();
    return DPoPKeyMaterial(
      keyPair: keyPair,
      publicKeyBytes: data.publicKey,
      seed: seed,
    );
  }

  static List<int> _generateSeed() {
    final r = math.Random.secure();
    return Uint8List.fromList(List<int>.generate(32, (_) => r.nextInt(256)));
  }

  static String _b64(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  static Uint8List _sha256(List<int> input) =>
      Sha256().hashSync(input).bytes as Uint8List;

  static Future<String> buildProof({
    required String method,
    required String url,
    required String? accessToken,
    required SimpleKeyPair keyPair,
    String? nonce,
  }) async {
    final header = {'typ': 'dpop+jwt', 'alg': 'ES256'};
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final jti = _generateJti();

    final payload = <String, dynamic>{
      'jti': jti,
      'htm': method,
      'htu': url,
      'iat': now,
    };
    if (accessToken != null) {
      payload['ath'] = _b64(_sha256(utf8.encode(accessToken)));
    }
    if (nonce != null) {
      payload['nonce'] = nonce;
    }

    final headerB64 = _b64(utf8.encode(jsonEncode(header)));
    final payloadB64 = _b64(utf8.encode(jsonEncode(payload)));
    final message = utf8.encode('$headerB64.$payloadB64');

    final signature = await _alg.sign(message, keyPair);
    final sigBytes = _derToRaw(signature.bytes);
    final sigB64 = _b64(sigBytes);

    return '$headerB64.$payloadB64.$sigB64';
  }

  static String _generateJti() {
    final r = math.Random.secure();
    return _b64(List<int>.generate(16, (_) => r.nextInt(256)));
  }

  /// Convert DER-encoded ECDSA signature to raw r||s (64 bytes).
  static List<int> _derToRaw(List<int> der) {
    if (der.length < 8) return der;

    int i = 2; // skip SEQUENCE tag + length byte

    i++; // skip INTEGER tag for r
    int rLen = der[i++];
    var r = <int>[];
    if (rLen > 32) {
      i++; // skip leading 0x00
      r.addAll(der.sublist(i, i + 32));
    } else {
      r.addAll(der.sublist(i, i + rLen));
    }
    i += r.length;

    i++; // skip INTEGER tag for s
    int sLen = der[i++];
    var s = <int>[];
    if (sLen > 32) {
      i++; // skip leading 0x00
      s.addAll(der.sublist(i, i + 32));
    } else {
      s.addAll(der.sublist(i, i + sLen));
    }

    // Normalize to exactly 32 bytes each
    while (r.length < 32) r.insert(0, 0);
    while (s.length < 32) s.insert(0, 0);
    if (r.length > 32) r = r.sublist(r.length - 32);
    if (s.length > 32) s = s.sublist(s.length - 32);

    return [...r, ...s];
  }
}
