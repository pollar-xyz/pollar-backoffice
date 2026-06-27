import 'dart:convert';

class PollarConfig {
  final String publishableKey;
  final String network;

  const PollarConfig({
    required this.publishableKey,
    this.network = 'testnet',
  });

  String get baseUrl => 'https://sdk.api.pollar.xyz/v1';
}

class WalletInfo {
  final String type; // custodial | smart | external
  final String? publicKey;
  final String? address;
  final bool existsOnStellar;
  final int? createdAt;
  final int? linkedAt;
  final String? network;
  final String? deployTxHash;

  const WalletInfo({
    required this.type,
    this.publicKey,
    this.address,
    this.existsOnStellar = false,
    this.createdAt,
    this.linkedAt,
    this.network,
    this.deployTxHash,
  });

  factory WalletInfo.fromJson(Map<String, dynamic> json) => WalletInfo(
        type: json['type'] as String? ?? 'custodial',
        publicKey: json['publicKey'] as String?,
        address: json['address'] as String?,
        existsOnStellar: json['existsOnStellar'] as bool? ?? false,
        createdAt: json['createdAt'] as int?,
        linkedAt: json['linkedAt'] as int?,
        network: json['network'] as String?,
        deployTxHash: json['deployTxHash'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        if (publicKey != null) 'publicKey': publicKey,
        if (address != null) 'address': address,
        'existsOnStellar': existsOnStellar,
        if (createdAt != null) 'createdAt': createdAt,
        if (linkedAt != null) 'linkedAt': linkedAt,
        if (network != null) 'network': network,
        if (deployTxHash != null) 'deployTxHash': deployTxHash,
      };
}

class SessionToken {
  final String accessToken;
  final String refreshToken;
  final int expiresAt;

  const SessionToken({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
  });

  factory SessionToken.fromJson(Map<String, dynamic> json) => SessionToken(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresAt: json['expiresAt'] as int,
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt,
      };

  bool get isExpired => DateTime.now().millisecondsSinceEpoch > expiresAt;

  int get expiresInMs => expiresAt - DateTime.now().millisecondsSinceEpoch;
}

class UserData {
  final String? mail;
  final String? firstName;
  final String? lastName;
  final String? avatar;
  final Map<String, dynamic>? providers;

  const UserData({
    this.mail,
    this.firstName,
    this.lastName,
    this.avatar,
    this.providers,
  });

  factory UserData.fromJson(Map<String, dynamic> json) => UserData(
        mail: json['mail'] as String?,
        firstName: json['first_name'] as String?,
        lastName: json['last_name'] as String?,
        avatar: json['avatar'] as String?,
        providers: json['providers'] as Map<String, dynamic>?,
      );

  Map<String, dynamic> toJson() => {
        if (mail != null) 'mail': mail,
        if (firstName != null) 'first_name': firstName,
        if (lastName != null) 'last_name': lastName,
        if (avatar != null) 'avatar': avatar,
        if (providers != null) 'providers': providers,
      };
}

class PersistedSession {
  final String clientSessionId;
  final String? userId;
  final String status;
  final SessionToken token;
  final Map<String, dynamic>? user;
  final WalletInfo wallet;
  final UserData? data;

  const PersistedSession({
    required this.clientSessionId,
    this.userId,
    required this.status,
    required this.token,
    this.user,
    required this.wallet,
    this.data,
  });

  factory PersistedSession.fromJson(Map<String, dynamic> json) =>
      PersistedSession(
        clientSessionId: json['clientSessionId'] as String,
        userId: json['userId'] as String?,
        status: json['status'] as String? ?? 'active',
        token: SessionToken.fromJson(json['token'] as Map<String, dynamic>),
        user: json['user'] as Map<String, dynamic>?,
        wallet: WalletInfo.fromJson(
            json['wallet'] as Map<String, dynamic>? ?? {}),
        data: json['data'] != null
            ? UserData.fromJson(json['data'] as Map<String, dynamic>)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'clientSessionId': clientSessionId,
        if (userId != null) 'userId': userId,
        'status': status,
        'token': token.toJson(),
        if (user != null) 'user': user,
        'wallet': wallet.toJson(),
        if (data != null) 'data': data!.toJson(),
      };

  bool get isTokenExpired => token.isExpired;

  String? get walletAddress => wallet.address;
}

class BuildTxParams {
  final String address;
  final String operation;
  final Map<String, dynamic> params;
  final Map<String, dynamic>? options;

  const BuildTxParams({
    required this.address,
    required this.operation,
    required this.params,
    this.options,
  });

  Map<String, dynamic> toJson(String network) => {
        'network': network,
        'address': address,
        'operation': operation,
        'params': params,
        if (options != null) 'options': options,
      };
}

class TxResult {
  final String hash;
  final String status; // PENDING | SUCCESS | FAILED
  final String? resultCode;
  final String? message;
  final Map<String, dynamic>? summary;
  final String? estimatedFee;

  const TxResult({
    required this.hash,
    required this.status,
    this.resultCode,
    this.message,
    this.summary,
    this.estimatedFee,
  });

  factory TxResult.fromJson(Map<String, dynamic> json) => TxResult(
        hash: json['hash'] as String,
        status: json['status'] as String,
        resultCode: json['resultCode'] as String?,
        message: json['message'] as String?,
        summary: json['summary'] as Map<String, dynamic>?,
        estimatedFee: json['estimatedFee'] as String?,
      );
}

class BuildTxResponse {
  final String unsignedXdr;
  final String networkPassphrase;
  final String? estimatedFee;
  final Map<String, dynamic>? summary;

  const BuildTxResponse({
    required this.unsignedXdr,
    required this.networkPassphrase,
    this.estimatedFee,
    this.summary,
  });

  factory BuildTxResponse.fromJson(Map<String, dynamic> json) =>
      BuildTxResponse(
        unsignedXdr: json['unsignedXdr'] as String,
        networkPassphrase: json['networkPassphrase'] as String,
        estimatedFee: json['estimatedFee'] as String?,
        summary: json['summary'] as Map<String, dynamic>?,
      );
}

class Balance {
  final String type;
  final String code;
  final String? issuer;
  final String balance;
  final String? available;
  final String? limit;
  final bool enabledInApp;

  const Balance({
    required this.type,
    required this.code,
    this.issuer,
    required this.balance,
    this.available,
    this.limit,
    this.enabledInApp = true,
  });

  factory Balance.fromJson(Map<String, dynamic> json) => Balance(
        type: json['type'] as String,
        code: json['code'] as String,
        issuer: json['issuer'] as String?,
        balance: (json['balance'] ?? '0').toString(),
        available: (json['available'] as String?),
        limit: json['limit'] as String?,
        enabledInApp: json['enabledInApp'] as bool? ?? true,
      );
}

class WalletBalance {
  final String publicKey;
  final String network;
  final bool exists;
  final List<Balance> balances;

  const WalletBalance({
    required this.publicKey,
    required this.network,
    required this.exists,
    required this.balances,
  });

  factory WalletBalance.fromJson(Map<String, dynamic> json) => WalletBalance(
        publicKey: json['publicKey'] as String,
        network: json['network'] as String,
        exists: json['exists'] as bool? ?? true,
        balances: (json['balances'] as List<dynamic>?)
                ?.map((e) => Balance.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class TxRecord {
  final String id;
  final String hash;
  final String network;
  final String status;
  final String? operation;
  final String? feeXlm;
  final String? resultCode;
  final Map<String, dynamic>? details;
  final String? summary;
  final String createdAt;

  const TxRecord({
    required this.id,
    required this.hash,
    required this.network,
    required this.status,
    this.operation,
    this.feeXlm,
    this.resultCode,
    this.details,
    this.summary,
    required this.createdAt,
  });

  factory TxRecord.fromJson(Map<String, dynamic> json) => TxRecord(
        id: json['id'] as String,
        hash: json['hash'] as String,
        network: json['network'] as String,
        status: json['status'] as String,
        operation: json['operation'] as String?,
        feeXlm: json['feeXlm'] as String?,
        resultCode: json['resultCode'] as String?,
        details: json['details'] as Map<String, dynamic>?,
        summary: json['summary'] as String?,
        createdAt: json['createdAt'] as String,
      );
}

class TxHistory {
  final List<TxRecord> records;
  final int total;
  final int limit;
  final int offset;

  const TxHistory({
    required this.records,
    required this.total,
    required this.limit,
    required this.offset,
  });

  factory TxHistory.fromJson(Map<String, dynamic> json) => TxHistory(
        records: (json['records'] as List<dynamic>?)
                ?.map(
                    (e) => TxRecord.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        total: json['total'] as int? ?? 0,
        limit: json['limit'] as int? ?? 20,
        offset: json['offset'] as int? ?? 0,
      );
}

class PollarApiResponse<T> {
  final String code;
  final bool success;
  final T content;

  const PollarApiResponse({
    required this.code,
    required this.success,
    required this.content,
  });

  factory PollarApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic) fromContent,
  ) =>
      PollarApiResponse(
        code: json['code'] as String,
        success: json['success'] as bool,
        content: fromContent(json['content']),
      );
}

class PollarException implements Exception {
  final String code;
  final String? message;
  final int? statusCode;

  const PollarException({
    required this.code,
    this.message,
    this.statusCode,
  });

  @override
  String toString() =>
      'PollarException($statusCode): $code${message != null ? ' - $message' : ''}';
}

class SessionStatus {
  final String status;
  final Map<String, dynamic>? user;

  const SessionStatus({required this.status, this.user});

  factory SessionStatus.fromJson(Map<String, dynamic> json) => SessionStatus(
        status: json['status'] as String,
        user: json['user'] as Map<String, dynamic>?,
      );

  bool get isReady => user?['ready'] == true;
}
