# Pollar × DeFindex Integration

This folder contains the integration of the **DeFindex yield protocol** with **Pollar wallet signing** on the Stellar Testnet.

## Setup & Environment Variables

Make sure the following variables are configured in your `.env.local` file:

```bash
# Pollar SDK configurations
NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=pub_testnet_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POLLAR_NETWORK=testnet

# DeFindex API configuration (Keep server-side, never expose to client!)
DEFINDEX_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Running the Project

1. Run the Next.js dev server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:3000/defindex-lajenny4](http://localhost:3000/defindex-lajenny4) in your browser.
3. Authenticate using your Pollar wallet credentials.
4. Interact with the default Testnet DeFindex vault (`CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6`) to deposit and withdraw.

## Folder Architecture

- **`app/defindex-lajenny4/page.tsx`**: Client-side UI dashboard with live position polling and APY updates. Uses Pollar's `signAndSubmitTx` to authorize the generated XDR transactions.
- **`app/api/defindex-lajenny4/route.ts`**: Server-side Next.js API route that loads the `@defindex/sdk` securely with `DEFINDEX_API_KEY` to fetch vault data and construct the unsigned deposit and withdraw XDRs.

## Link to Demo Video
Open [https://drive.google.com/file/d/1Iv64y1d1YHMM3XtyL1VmGKwjJYPbMevg/view?usp=sharing](https://drive.google.com/file/d/1Iv64y1d1YHMM3XtyL1VmGKwjJYPbMevg/view?usp=sharing) in your browser.
