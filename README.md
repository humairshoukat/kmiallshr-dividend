# KMIALLSHR Dividend Board

Next.js app for every current KMIALLSHR constituent on PSX, including companies
with no dividends in the reporting window.

It shows:
- a rolling window covering the previous two completed financial years and the
  current financial year
- all three annual dividend totals side by side for every company
- payout interval labels such as `Single`, `Biannual`, `Triannual`, and `Quarterly`
- yearly cash return on a default Rs 100,000 holding per stock
- configurable withholding tax, zakat, and face-value assumption

## Data source

The importer pulls from official PSX endpoints:
- current KMIALLSHR constituent list: `https://dps.psx.com.pk/indices/KMIALLSHR`
- per-symbol payout feed: `https://dps.psx.com.pk/company/<SYMBOL>` and `POST https://dps.psx.com.pk/company/payouts`

`data/stocks.json` is a generated snapshot for the latest import date included in
the repo. Every refresh starts by downloading the live KMIALLSHR constituent list,
then writes a record for every constituent. Companies without a dividend receive
explicit zero totals instead of being omitted.

The refresh also merges newly published payout rows into the existing local
snapshot. This preserves observed history when older rows later roll out of the
finite PSX company payout feed.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Refresh the PSX dataset if needed:

```bash
npm run data:fetch
```

3. Start the app:

```bash
npm run dev
```

## Scripts

```bash
npm run data:fetch         # scrape PSX and write data/stocks.json
npm run data:backfill-2024 # restore Jul-Dec 2024 from daily archive PDFs
npm run test:data
npm run lint
npm run build
```

## Notes

- The latest financial year is year-to-date and reflects cash dividends already
  published on PSX as of the import date. The three displayed years roll forward
  automatically after the start of Pakistan's July–June financial year.
- Dividend rows are assigned by their PSX announcement date to one shared
  July–June financial-year cycle. For example, FY25 is July 2024 through June
  2025, FY26 is July 2025 through June 2026, and FY27 is July 2026 through June
  2027. A company's own fiscal-year end is informational and does not affect
  this grouping.
- The July-December 2024 backfill uses PSX daily announcement-sheet PDFs and
  requires Poppler's `pdftotext`. Normal live refreshes retain the archived rows,
  so the backfill does not need to run each time.
- PSX payout rows are published as dividend percentages. The app converts them to rupees per share using a configurable face value assumption, defaulting to Rs 10.
- `data/stocks.json` contains one current price per stock. Historical price-hike calculations require a separate dated price history and are not derived from the current snapshot.
