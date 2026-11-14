# Dividend accuracy audit, 14 November 2026

The independent review confirmed inflated cash dividends caused by duplicate archive and company-feed records. The repair removes 45 redundant archive records across 39 of 313 stocks. It preserves every live payout, all prices, all face-value metadata, and the snapshot cutoff of 10 November 2026.

## Evidence and scope

The independent reviewer retrieved official PSX payout feeds for 12 stocks, including FFC and EFERT as controls. A follow-up fetched fresh company pages and payout feeds for all 39 affected stocks plus those two controls. Forty of the 41 stock comparisons matched both repaired yearly summaries exactly, including payout counts and percentages.

BIFO's live feed no longer includes its 24 April 2025 dividend. A freshly downloaded [PSX announcement sheet](https://dps.psx.com.pk/download/announce/2025-04-24.pdf), row 25, confirms a 15% interim dividend for 31 March 2025. That retained payout adds Rs 1.50 to the live feed's Rs 3.50, supporting the repaired 2025 total of Rs 5.00.

This establishes the duplicate repair for the affected stocks. It is not a certification of every original announcement for all 313 constituents, or of historical corporate-action adjustments. Totals use the existing calendar announcement-year and current-face-value methodology.

## Causes and fixes

- The old identity required the same announcement date and period. Archive publication dates and company-feed posting dates differ, and some PSX periods contain typos. Shared reconciliation now compares dividend kind and normalized book closure. A bounded fallback requires equal amounts and the same period within 31 days, or a missing period within seven days.
- The [2 July 2026 GHGL sheet](https://dps.psx.com.pk/download/announce/2026-07-02.pdf) corrects the previous day's dividend from 5% to 10%. Both versions and the live copy had been counted. Later archive corrections now supersede earlier copies; live PSX payout records take precedence over archive copies.
- The [14 September 2026 IREIT sheet](https://dps.psx.com.pk/download/announce/2026-09-14.pdf) corrects the September 11 closure dates. Its correction is the same entitlement. Separate final and interim dividends sharing that closure remain separate.
- The archive parser rejected four-letter September dates such as Sept. It now accepts them.
- CSAP and MRNS have contradictory periods and closures across sources. Their verified aliases and primary-source links are recorded in [the exception register](../data/psx-payout-aliases.json). No general rule guesses across different financial periods.
- Replaying the cached archive exposed conflicting dividend-kind labels for BWHL and PPL. Two additional source-linked aliases prevent those copies from being added by a future backfill. General matching still preserves separate final and interim dividends.

Broader matching requires an archive record. Distinct live rows remain distinct. Multiple incompatible candidate periods stop the import before the snapshot is written.

## Snapshot changes

All amounts below are PKR per current share. A repeated repair removes zero records.

| Stock | Records removed | 2025 before → after | 2026 before → after |
| --- | ---: | ---: | ---: |
| [AGIL](https://dps.psx.com.pk/company/AGIL) | 1 | 1.75 → 1.75 | 10 → 5 |
| [ARPL](https://dps.psx.com.pk/company/ARPL) | 1 | 30 → 30 | 90 → 45 |
| [BAFS](https://dps.psx.com.pk/company/BAFS) | 1 | 4 → 2 | 0 → 0 |
| [BERG](https://dps.psx.com.pk/company/BERG) | 1 | 10 → 5 | 5 → 5 |
| [BIFO](https://dps.psx.com.pk/company/BIFO) | 1 | 8.5 → 5 | 5 → 5 |
| [CSAP](https://dps.psx.com.pk/company/CSAP) | 1 | 7.5 → 7.5 | 7.5 → 5.5 |
| [DOL](https://dps.psx.com.pk/company/DOL) | 1 | 4 → 4 | 6 → 4 |
| [DYNO](https://dps.psx.com.pk/company/DYNO) | 1 | 15 → 15 | 24.75 → 15.5 |
| [ECOP](https://dps.psx.com.pk/company/ECOP) | 1 | 2 → 2 | 6 → 3 |
| [EPQL](https://dps.psx.com.pk/company/EPQL) | 1 | 10.5 → 10.5 | 4.25 → 3 |
| [GADT](https://dps.psx.com.pk/company/GADT) | 1 | 0 → 0 | 10 → 5 |
| [GEMBCEM](https://dps.psx.com.pk/company/GEMBCEM) | 1 | 0.78 → 0.39 | 0.6 → 0.6 |
| [GEMPAPL](https://dps.psx.com.pk/company/GEMPAPL) | 1 | 0 → 0 | 1 → 0.5 |
| [GHGL](https://dps.psx.com.pk/company/GHGL) | 2 | 2 → 2 | 5.5 → 4 |
| [GOC](https://dps.psx.com.pk/company/GOC) | 1 | 2 → 1 | 2 → 2 |
| [HCAR](https://dps.psx.com.pk/company/HCAR) | 2 | 16 → 8 | 18 → 9 |
| [ILP](https://dps.psx.com.pk/company/ILP) | 1 | 1 → 1 | 6 → 4 |
| [IREIT](https://dps.psx.com.pk/company/IREIT) | 3 | 0 → 0 | 0.805 → 0.43 |
| [ISL](https://dps.psx.com.pk/company/ISL) | 1 | 2.5 → 2.5 | 7 → 5 |
| [KTML](https://dps.psx.com.pk/company/KTML) | 1 | 0.8 → 0.4 | 0 → 0 |
| [LUCK](https://dps.psx.com.pk/company/LUCK) | 1 | 4 → 4 | 10 → 5 |
| [MEBL](https://dps.psx.com.pk/company/MEBL) | 1 | 35 → 28 | 30.5 → 30.5 |
| [MRNS](https://dps.psx.com.pk/company/MRNS) | 1 | 2.5 → 2.5 | 5.5 → 5 |
| [OGDC](https://dps.psx.com.pk/company/OGDC) | 1 | 15.55 → 15.55 | 24.5 → 18.5 |
| [PIOC](https://dps.psx.com.pk/company/PIOC) | 1 | 15 → 10 | 0 → 0 |
| [PPL](https://dps.psx.com.pk/company/PPL) | 2 | 7.5 → 7.5 | 20 → 12 |
| [PPP](https://dps.psx.com.pk/company/PPP) | 1 | 5 → 5 | 16 → 8 |
| [PTL](https://dps.psx.com.pk/company/PTL) | 1 | 0 → 0 | 6 → 4 |
| [SARC](https://dps.psx.com.pk/company/SARC) | 1 | 3 → 1.5 | 1.5 → 1.5 |
| [SHDT](https://dps.psx.com.pk/company/SHDT) | 1 | 2.5 → 1.25 | 1.25 → 1.25 |
| [SHFA](https://dps.psx.com.pk/company/SHFA) | 1 | 5 → 5 | 10 → 5 |
| [SNGP](https://dps.psx.com.pk/company/SNGP) | 1 | 18 → 10.5 | 3 → 3 |
| [STYLERS](https://dps.psx.com.pk/company/STYLERS) | 1 | 1 → 1 | 2 → 1.75 |
| [SURC](https://dps.psx.com.pk/company/SURC) | 1 | 10 → 5 | 10 → 10 |
| [UDPL](https://dps.psx.com.pk/company/UDPL) | 1 | 52.75 → 51.5 | 2.5 → 2.5 |
| [UPFL](https://dps.psx.com.pk/company/UPFL) | 2 | 2635 → 2035 | 1425 → 1209 |
| [WAFI](https://dps.psx.com.pk/company/WAFI) | 1 | 3 → 3 | 12 → 8 |
| [WAHN](https://dps.psx.com.pk/company/WAHN) | 1 | 20 → 10 | 5 → 5 |
| [ZAL](https://dps.psx.com.pk/company/ZAL) | 1 | 1.1 → 1 | 1 → 1 |

## Reproduce and verify

The one-time snapshot repair is complete. Its standalone repair script has been removed. Live imports, face-value refreshes, and archive backfills use the shared reconciler before calculating totals. Use `npm run data:refresh` for future PSX updates.

Regression coverage includes differing posting dates, period typos, corrected amounts, missing periods, Sep/Sept dates, live-source precedence, final/interim separation, ambiguous periods, explicit aliases, archive re-imports, and repeated reconciliation. Verification commands are npm run test:data, npm run lint, npm run build, and npm run test:ui.

Final results:

- All 21 data tests and five Chromium UI tests passed. Lint and the production build passed.
- Six corrected totals and payout counts were checked directly in the running local dashboard.
- Replaying 450 cached announcement sheets, containing 691 parsed payouts, added no payouts and changed no totals. A second replay produced the same records.
- Snapshot comparison confirmed all 313 stocks' metadata and every live payout were preserved. Only the 45 redundant archive rows and their calculated summaries changed.
- BWHL's live feed was also freshly checked after the archive replay found its conflicting interim label. Its totals matched the snapshot.
- One existing holding-control test had an outdated hard-coded FFC price. Its investment input now uses the snapshot price; expected cash dividends remain literal values.
