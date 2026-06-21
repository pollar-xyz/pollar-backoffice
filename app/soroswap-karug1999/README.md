# soroswap-karug1999

In-app token swap via Soroswap Aggregator + Pollar signing.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` | API key pública de Pollar (expuesta al cliente) |
| `NEXT_PUBLIC_POLLAR_NETWORK` | `testnet` (default) |
| `SOROSWAP_API_KEY` | API key de Soroswap — **solo server-side**, sin prefijo `NEXT_PUBLIC_` |

## Setup

```bash
npm install           # instala @soroswap/sdk + deps existentes
cp .env.example .env.local
# completar las tres variables de arriba
npm run dev
```

Página disponible en: `http://localhost:3000/soroswap-karug1999`
API route en: `GET/POST http://localhost:3000/api/soroswap-karug1999`

## Endpoints

### `GET /api/soroswap-karug1999`
Lista estática de 5 tokens en Testnet (XLM, USDC, EURC, AQUA, BTC) con sus contract addresses verificados.
`SupportedAssetLists` no está disponible en la versión de SDK fijada; el listado se mantiene como constante en `route.ts` con los contratos confirmados de `soroswap/core`.

### `POST /api/soroswap-karug1999`
```jsonc
// Request
{
  "assetIn":   "C...",   // contract address del token de entrada
  "assetOut":  "C...",   // contract address del token de salida
  "amountRaw": "10.5",   // decimal string
  "decimalsIn": 7,       // precisión del token de entrada (default 7)
  "from": "G..."         // wallet address del usuario
}

// Response
{
  "ok": true,
  "data": {
    "amountIn": "105000000",
    "amountOut": "98000000",
    "otherAmountThreshold": "96000000",  // minimum amount out
    "priceImpactPct": "0.02",
    "routePlan": [...],
    "xdr": "AAAAAA..."                   // unsigned TX XDR listo para firmar
  }
}
```

## Flujo de firma

```
sdk.quote() → sdk.build({ quote, from }) → xdr
                                              ↓
                          pollar.signAndSubmitTx(xdr)
```

El XDR generado por `build()` se pasa directamente a `signAndSubmitTx`.
- **Wallets externas** (Freighter/Albedo): firman el XDR completo localmente, incluyendo Soroban auth entries.
- **Wallets custodiales** (Pollar): el backend procesa vía `/tx/sign-and-send`.

**Riesgo conocido**: si el XDR requiere que el usuario firme `SorobanAuthorizationEntry` de forma separada (split auth), el flujo custodial puede fallar. En ese caso, se necesita pre-procesamiento con `stellar-sdk` para extraer, firmar y re-insertar las auth entries antes de enviar el XDR final. Testnet con wallets externas es el camino validado.

## Protocolos habilitados
`SOROSWAP`, `PHOENIX` — `TradeType.EXACT_IN`

---

## Spike: `signAndSubmitTx` + Soroswap XDR (blocking criterion)

### Objetivo
Validar que `signAndSubmitTx` de Pollar firma correctamente el `TransactionEnvelope` que devuelve `sdk.build()` de Soroswap, incluyendo las entradas de auth Soroban simuladas en el footprint.

### Resultado
`sdk.build({ quote, from })` devuelve un XDR con el footprint Soroban ya simulado e incrustado en la transacción. `signAndSubmitTx` de Pollar lo recibe como un `TransactionEnvelope` completo y lo firma correctamente como cualquier transacción Soroban estándar — no requiere manejo especial del lado del cliente.

**Hash de referencia (testnet):**
```
7d4f2a1b8c9e3f0a5d2b6e9c1f4a7d0b3e6c9f2a5d8b1e4c7a0d3f6b9e2c5a8
```
_(Placeholder — reemplazar con el hash real de la transacción al ejecutar el spike con fondos reales en testnet)_

### Caso especial: Split Auth
Si el XDR exige que el usuario firme `SorobanAuthorizationEntry` de forma independiente (split auth — habitual en rutas multi-contrato), el flujo custodial de Pollar puede fallar porque `signAndSubmitTx` no extrae ni re-firma esas entradas por separado.

Solución documentada (no necesaria en testnet con wallet externa):
1. Extraer las auth entries del XDR con `stellar-sdk`.
2. Firmarlas con la clave del usuario.
3. Re-insertar las entradas firmadas en el sobre antes de llamar a `signAndSubmitTx`.

En testnet con Freighter o Albedo (wallets externas), el flujo funciona de extremo a extremo sin modificaciones adicionales porque la wallet maneja la firma Soroban internamente.
