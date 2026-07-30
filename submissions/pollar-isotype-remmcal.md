# Submission: Pollar Isotype — refined bear symbol

**Issue:** [#43](https://github.com/pollar-xyz/pollar-backoffice/issues/43)
**Nickname:** remmcal
**Editable source (Figma):** https://www.figma.com/design/BlB5oNtcA8Zblcvg4mUbuB/Pollar---Foundations---Media?node-id=211-30
**Exports (Drive):** https://drive.google.com/drive/folders/17bboi2W-OCYLxokTRcza9Ay-qN1xlb6K
**Portfolio:** https://www.behance.net/remmcal

## What it is

A refinement of Pollar's isotype — the polar bear symbol on its own. Same
animal, same identity: the shapes were simplified, the curves rebuilt and the
weights and negative space rebalanced so the mark holds together from a 16px
favicon up to large format. The name and the wordmark are untouched; the
lockups only position the existing wordmark next to the refined symbol.

This continues the brand work delivered in
[#11](https://github.com/pollar-xyz/pollar-backoffice/issues/11) (logo + brand
system, assets already in `public/Brand_positive` and `public/Brand_negative`).
It is not a rebrand and not a new brand system — the scope is the symbol.

## Approach

- **Simplification.** Redundant anchor points and near-duplicate curves
  collapsed into fewer, cleaner paths. Interior detail that only read above
  ~48px was removed rather than shrunk, so the silhouette carries the
  recognition at small sizes.
- **Optical balance.** Head mass, ear placement and the negative space around
  the muzzle adjusted by eye, not by grid, so the mark reads centered when
  placed in a circular avatar or a square app icon.
- **Consistent fill logic.** One filled-shape system throughout — no mixed
  stroke/fill, no strokes that would scale unevenly or need outlining later.

## Variants

| Variant | Light (`#F9FAFC`) | Dark |
| ------- | ----------------- | ---- |
| Full-color | ✅ | ✅ |
| Monochrome positive | ✅ | ✅ |
| Monochrome negative | ✅ | ✅ |

Primary is `#005DB4`, base background `#F9FAFC`, per the brand system.

## Sizes and favicon

Tested at 16px, 32px, 512px and large format. Because the detailed symbol
loses definition below ~24px, a **simplified favicon cut** ships alongside it,
and the favicon set is exported at **16, 32, 48 and 512**.

## Lockups

Horizontal and vertical lockups with the **existing, unmodified** wordmark —
spacing and optical alignment only. Delivered as SVG + PNG.

## Usage notes

A one-page spec in the Figma source covers clear space, minimum sizes and
do's & don'ts for the symbol (no re-coloring outside the defined variants, no
stretching, no added effects, no placement on backgrounds that kill contrast).

## Deliverables

- [x] Editable source delivered (Figma), organized and named — not exports only
- [x] Refined isotype: simplified shapes, rebuilt curves, balanced negative
      space, recognizable as the same bear
- [x] Clean vector — optimized paths, no embedded rasters, scales without loss
- [x] Legible at 16px and at large format
- [x] Full-color, monochrome positive and monochrome negative variants
- [x] Light (`#F9FAFC`) and dark background versions
- [x] Favicon set: 16, 32, 48, 512 (plus simplified cut for < 24px)
- [x] Final exports: SVG + PNG of each variant, light and dark
- [x] Horizontal and vertical lockups with the current wordmark, unmodified
- [x] Usage page: clear space, minimum sizes, do's & don'ts

## Out of scope (per the issue)

No wordmark redesign, no name change, no publication/social template system,
no merch or print-ready files, no motion, no product UI.

Closes #43
