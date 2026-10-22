# KMIALLSHR Dividend Board

A Next.js dashboard for exploring cash dividends and current prices for companies
in the Pakistan Stock Exchange (PSX) KMIALLSHR index.

The project stores a committed PSX data snapshot, so the dashboard works without
making requests to PSX at page-load time. Separate importer scripts refresh that
snapshot when required.

## What the app shows

### Dividend Board (`/`)

- A rolling three-financial-year dividend view
- Dividend paid per share, payout count, and payout interval for each year
- Estimated gross and net cash return for a configurable investment per stock
- Configurable withholding tax, zakat, and share face-value assumptions
- Search by company name or symbol
- Ranking by net dividend yield for the selected financial year

The ranked table shows companies that paid a dividend in the selected year. The
snapshot itself still contains every constituent returned by the KMIALLSHR index
page, including companies with zero payouts.

### Price Snapshot (`/price-hikes`)

- The latest imported price for each constituent
- The source date associated with each price

This route does not calculate price changes. The dataset contains one current
price per stock, so price-performance calculations would require a separate dated
price history.

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Plain CSS
- Cheerio for parsing PSX HTML responses
- Node's built-in test runner for importer tests

## Requirements

- Node.js 20.18.1 or newer
- npm
- Internet access when refreshing PSX data
- `pdftotext` from Poppler only when running the historical archive backfill

## Local development

Install the locked dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create an optimized production build |
| `npm start` | Serve a completed production build |
| `npm run lint` | Lint application and importer code |
| `npm run test:data` | Run data-parser unit tests |
| `npm run data:fetch` | Refresh constituents, prices, and payouts from PSX |
| `npm run data:backfill-2024` | Import July–December 2024 payouts from PSX archive PDFs |

Run the project checks with:

```bash
npm run test:data
npm run lint
npm run build
```

## Data sources and refresh behavior

The importer uses official PSX pages and endpoints:

- KMIALLSHR constituents and latest prices:
  `https://dps.psx.com.pk/indices/KMIALLSHR`
- Company details: `https://dps.psx.com.pk/company/<SYMBOL>`
- Company payout feed: `https://dps.psx.com.pk/company/payouts`
  (POST with the company page's `window.__ps._k` value in `X-Req-Id` and
  `X-Requested-With: XMLHttpRequest`; requests without the ID return 404)
- Historical announcement sheets:
  `https://dps.psx.com.pk/download/announce/<YYYY-MM-DD>.pdf`

`data/stocks.json` is the generated, committed snapshot consumed by the app.
`npm run data:fetch` performs the following work:

1. Downloads the current KMIALLSHR constituent list and latest prices.
2. Fetches each constituent's company page and payout rows.
3. Keeps only the rolling three-year July–June reporting window.
4. Merges previously observed payouts from the existing snapshot, preserving
   records that may have rolled out of PSX's finite live feed.
5. Writes the new snapshot atomically only after every constituent succeeds.

The archive backfill is a one-off recovery tool for July through December 2024.
It downloads daily PSX PDFs into the ignored `tmp/` directory, extracts their
text with `pdftotext`, and merges matching dividend announcements into the
current snapshot.

## Financial-year and return methodology

- Reporting years use one shared July–June cycle. An announcement dated between
  July 2024 and June 2025 belongs to FY25, regardless of the company's own
  financial year end.
- PSX publishes cash dividends as percentages of share face value. The importer
  stores both that percentage and a per-share value based on a default Rs 10
  face value.
- The dashboard scales per-share dividends when the face-value assumption is
  changed.
- Estimated shares held are `investment / latest price`; fractional shares are
  therefore included in the estimate.
- Net cash is gross dividend cash after the combined withholding-tax and zakat
  percentages entered in the dashboard.

The current financial year is year-to-date as of the snapshot date. Calculations
are estimates for exploration, not tax or investment advice.

## Project structure

```text
data/stocks.json                 Generated PSX snapshot
scripts/fetch-psx-data.mjs       Live PSX importer
scripts/backfill-psx-archive.mjs Historical PDF backfill
scripts/fetch-psx-data.test.mjs  Importer unit tests
src/app/                         Next.js routes, layout, and global styles
src/components/                  Dashboard and navigation components
src/lib/stocks.ts                Snapshot types and application data loader
```
