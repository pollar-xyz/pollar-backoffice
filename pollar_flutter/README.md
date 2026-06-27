# pollar_flutter

Flutter SDK for [Pollar](https://pollar.xyz) — custodial Stellar wallets via `sdk.api.pollar.xyz`.

This is a pure Dart/Flutter HTTP client that talks to the Pollar API. All transaction signing happens server-side (AWS KMS); the client never holds the Stellar private key.

## Install (via git dependency)

```yaml
dependencies:
  pollar_flutter:
    git:
      url: https://github.com/<your-org>/pollar-flutter.git
      path: pollar_flutter
```

Then run:
```bash
flutter pub get
```

## Platform Configuration

### iOS — `ios/Runner/Info.plist`

Add the OAuth callback URL scheme so the browser can return to your app after Google/GitHub login:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLName</key>
    <string>pollarflutter</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>pollarflutter</string>
    </array>
  </dict>
</array>
```

### Android — `android/app/build.gradle`

The callback scheme is handled automatically by `flutter_web_auth_2` via Chrome Custom Tabs.

For Android 11+ (API 30+), add to `android/app/src/main/AndroidManifest.xml` inside `<application>`:

```xml
<activity
    android:name="com.linusu.flutter_web_auth_2.CallbackActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="pollarflutter" />
    </intent-filter>
</activity>
```

### Pollar Dashboard

Add your OAuth redirect URI (`pollarflutter://callback`) under **Allowed Origins** in the [Pollar Dashboard](https://dashboard.pollar.xyz).

## Usage

```dart
import 'package:pollar_flutter/pollar_flutter.dart';

void main() {
  runApp(
    PollarProvider.create(
      publishableKey: 'pub_testnet_YOUR_KEY',
      child: MaterialApp(
        home: MyApp(),
      ),
    ),
  );
}
```

### Login

```dart
final controller = PollarProvider.of(context);

// Email OTP
await controller.beginEmailLogin();
await controller.sendEmailCode('user@example.com');
await controller.verifyEmailCode('123456');

// OAuth (after deep-link setup)
final url = await controller.beginOAuth('google', 'pollarflutter://callback');
// Open url in browser with flutter_web_auth_2
await controller.completeOAuth();
```

### Transactions

```dart
// Build + sign + submit (atomic)
final result = await controller.runTx(
  operation: 'payment',
  params: {
    'destination': 'G...',
    'amount': '10',
    'asset': 'native',
  },
);
print('${result.status}: ${result.hash}');

// Or sign & submit a pre-built XDR
final result = await controller.signAndSubmitTx(unsignedXdr);
```

### Balance & History

```dart
final balance = await controller.refreshBalance();
final history = await controller.refreshHistory();
```

## API Coverage

| Endpoint | Status |
|----------|--------|
| `POST /auth/session` | ✅ |
| `GET /auth/session/status/{id}/poll` | ✅ |
| `GET /auth/session/resume` | ✅ |
| `POST /auth/email` | ✅ |
| `POST /auth/email/verify-code` | ✅ |
| `POST /auth/login` (DPoP-bound) | ✅ |
| `POST /auth/refresh` (DPoP-only) | ✅ |
| `POST /auth/logout` | ✅ |
| `GET /auth/google` / `GET /auth/github` | ✅ (URLs) |
| `POST /tx/build` | ✅ |
| `POST /tx/sign-and-send` | ✅ |
| `POST /tx/build-sign-submit` | ✅ |
| `GET /tx/history` | ✅ |
| `GET /tx/status` | ✅ |
| `GET /wallet/balance` | ✅ |

## Architecture

```
PollarApiClient          → Low-level HTTP, DPoP headers, JSON wrapping
PollarController         → ChangeNotifier state machine
PollarProvider           → InheritedNotifier (Flutter tree injection)
SessionStorage           → flutter_secure_storage persistence
DPoPProvider             → EC P-256 key generation and proof signing
```

## Development

```bash
cd pollar_flutter
flutter pub get
dart analyze
```

## License

MIT
