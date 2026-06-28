# Pollar — Design System & Screens

Documentation for the Pollar back-office visual language and the three high-fidelity
screens delivered for issue #1.

**Figma file (view and duplicate enabled):**
https://www.figma.com/design/A4f9zredyhJtPUKQjworhe/Pollar?node-id=0-1

The work lives in a single Figma file, organized into four sections: `01 · Tokens`,
`02 · Componentes base`, `03 · Screens`, and a `Handoff note`. Everything is bound to
shared variables and text styles — no hardcoded values — and ships in both a Light and
a Dark mode.

---

## 1. Visual language / design tokens

Tokens are implemented as Figma **variables** (color, spacing, radius) and **text
styles** (typography), grouped in a single collection named `Pollar Tokens` with two
modes: **Light** and **Dark**.

### 1.1 Color

Primary brand color is `#0560A9`. Each family is a full ramp so the same token can be
used for fills, hovers, borders and text without improvising values.

**Primary**

| Token | Light |
|---|---|
| Primary/25 | `#F5F9FD` |
| Primary/50 | `#EAF2FA` |
| Primary/100 | `#CFE0F1` |
| Primary/200 | `#A3C5E3` |
| Primary/300 | `#6BA1D1` |
| Primary/400 | `#2E7BBD` |
| Primary/500 | `#0560A9` |
| Primary/600 | `#054F8C` |
| Primary/700 | `#053F70` |
| Primary/800 | `#053355` |
| Primary/900 | `#04263F` |

**Neutral** — Slate scale `Neutral/50 #F8FAFC` → `Neutral/950 #020617`, used for text,
borders, surfaces and skeletons.

**Semantic** — each with a `-bg` and `-text` pair for badges:

| Role | Base | Background | Text |
|---|---|---|---|
| Success | `#16A34A` | `#DCFCE7` | `#166534` |
| Warning | `#D97706` | `#FEF3C7` | `#92400E` |
| Error | `#DC2626` | `#FEE2E2` | `#991B1B` |
| Info | `#0560A9` | `#EAF2FA` | `#053F70` |

**Surface** — `canvas #E7EBF1` (page behind the floating panel) and
`row-hover #FBFDFF`. **Accent** — `purple #6D28D9`, `purple-bg #EDE9FE`.
**Base** — `white #FFFFFF`, `black #000000`, and `on-accent #FFFFFF` (a stable white
for text/icons sitting on colored fills, so it stays correct in both modes).

### 1.2 Typography

**Geist** for all UI text and **Geist Mono** for keys, addresses, amounts and code.
Provided as text styles across three scales — Display (2xl → xs), Text (xl → xs) and
Mono (2xl → xs) — each in Regular / Medium / Semibold / Bold (68 styles total). Weight
is part of the style, not an override.

### 1.3 Spacing

4px base grid, bound as variables: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`
(xs → 4xl).

### 1.4 Radius

`sm 4 · md 8 · lg 12 · xl 16 · 2xl 24 · full` (pills and avatars). Paddings, gaps and
corners on components are bound to these variables, so restyling means swapping a token
rather than typing pixels.

### 1.5 Dark mode

A second **Dark** mode on the same collection. Neutrals and surfaces are inverted (text
becomes light, backgrounds dark, with a layered hierarchy: canvas `#0B111C` < panel /
cards `#131A27` < elevated `#1B2536`), Primary is kept as the brand accent, semantic
colors are darkened, and `on-accent` stays white. Because every component reads
variables, switching a frame's mode flips the whole UI. `Neutral/400` in Dark was tuned
to `#7C8A9C` to keep muted text above 4.5:1.

---

## 2. Base components and usage

All components are built once and used as instances inside the screens; visual changes
were made on the parent component.

- **Button** — properties for Type, Size and State, pill radius, an optional leading
  icon (boolean) and an icon instance-swap. Text/icons on filled buttons use the
  `on-accent` token so they stay white in both modes.
- **Input** — text field bound to surface and border tokens; relies on the border for
  separation from the card.
- **Status badge** — semantic color pairs (`-bg` / `-text`) with an optional status dot.
- **Tab** — Underline and Pill styles, with active / default states.
- **Card** — extended with Type = Stat / Stat hero / Section / Basic, an icon
  instance-swap, and footer toggles (delta, progress, badge, caption) so one component
  covers metric tiles, section containers and simple cards.
- **Table** — sortable column headers, identicons, monospaced keys, and status / auth
  badges.
- **Modal** — Dialog, Destructive and SDK-login types.
- **Icon set** — a single component holding the icons used across screens (including
  multicolor brand icons such as Google).

---

## 3. Screens

Each screen uses the floating layout established for the product: a `#E7EBF1` canvas, a
rounded white (or dark) app panel, a fixed sidebar grouped into BUILD / USERS / TREASURY
/ INTEGRATIONS, and a top bar with search, mail, notifications and the user avatar.
Each screen has a Dark variant beside it in the `03 · Screens` section.

### 3.1 Wallets — `/users/wallets`

Requested: a high-fidelity view of all end-user wallets created by the application.

Delivered: summary stat cards (with a hero card for the primary metric) and a wallets
table with public key, status, trustlines, balance, auth type, activity and API key,
plus type filter, sorting and pagination. Functional parity with the source screen was
preserved (no features added or removed).

States:
- **Empty** — no wallets yet.
- **Loading** — skeleton rows.
- **Error** — load failure with a Retry action.

### 3.2 Token Distribution — `/treasury/token-distribution`

Requested: the wallet that distributes tokens to users via `fund()`.

Delivered: stat cards, the distribution wallet card (balance, per-asset chips, public
key), a "split into dedicated wallets" flow using the Destructive modal pattern, a
distribution rules table, and a recent distributions list.

States (applied to both lists):
- **Empty** — "No distribution rules yet" / "No distributions yet".
- **Loading** — skeleton table and list rows.
- **Error** — "Couldn't load rules" / "Couldn't load distributions" with Retry.

### 3.3 Branding — `/build/branding`

Requested: customization of the SDK login modal's appearance.

Delivered: theme toggle (Light / Dark), accent color with default `#0560A9`, logo
upload, login methods (email, social providers with "Coming soon" states, wallets), and
a live preview rendering the SDK login modal with its tab bar. The preview stays in the
customer's selected theme even when the dashboard is in dark mode.

States:
- **Loading** — skeleton controls plus a preview placeholder.
- **Error** — "Couldn't load branding settings" with Retry.
- **Saving / Saved** — in-progress button state and a confirmation toast.

Empty does not apply here: a settings screen always has defaults (the logo upload
drop-zone is itself the empty state for that control).

---

## 4. Accessibility

Text contrast meets **WCAG AA** (body text ≥ 4.5:1, large / UI text ≥ 3:1), verified
programmatically across both Light and Dark modes. Status is communicated with icon and
label, not color alone, and interactive controls keep comfortable hit areas and visible
borders.

---

## 5. Handoff notes

Captured inside the Figma file (`Handoff note` section) and summarized here:

- **Tokens** — use the variables and text styles; never paste a raw hex or type a pixel
  value that exists as a token.
- **Components** — the screens are made of instances; change the parent component to
  propagate.
- **States** — see section 3 for which screen has Empty / Loading / Error and the exact
  copy used.
- **Behavior** — table headers sort; preview tabs switch context; the "Updating live"
  indicator reflects unsaved edits; disabled providers read "Coming soon".
- **Accessibility** — see section 4.
- **Open items** — Dark mode is included; responsive / mobile is out of scope for this
  pass.

---

## 6. Figma

https://www.figma.com/design/A4f9zredyhJtPUKQjworhe/Pollar?node-id=0-1

Shared with view and duplicate enabled.
