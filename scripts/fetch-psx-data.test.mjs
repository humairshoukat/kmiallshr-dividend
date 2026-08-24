import assert from "node:assert/strict";
import test from "node:test";
import {
  extractDividendPercent,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  parseIndexConstituents,
} from "./fetch-psx-data.mjs";
import {
  extractArchivePayouts,
  periodLabelForArchive,
} from "./backfill-psx-archive.mjs";

test("the rolling window changes at midnight in Pakistan on July 1", () => {
  assert.deepEqual(
    getFiscalYearWindow(new Date("2026-06-30T18:59:59Z")),
    [2024, 2025, 2026],
  );
  assert.deepEqual(
    getFiscalYearWindow(new Date("2026-06-30T19:00:00Z")),
    [2025, 2026, 2027],
  );
});

test("payouts use a fixed July through June financial year", () => {
  assert.equal(
    financialYearFromPayoutDate(new Date("2024-07-01T00:00:00Z")),
    2025,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2025-06-30T00:00:00Z")),
    2025,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2025-07-01T00:00:00Z")),
    2026,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2026-07-01T00:00:00Z")),
    2027,
  );
  assert.equal(financialYearFromPayoutDate(new Date("Jul 1, 2025")), 2026);
});

test("cash dividend parsing accepts PSX rows with or without a percent sign", () => {
  assert.equal(extractDividendPercent("75%(i) (D)"), 75);
  assert.equal(extractDividendPercent("80(ii) (D)"), 80);
  assert.equal(extractDividendPercent("10%(B), 5%(i) (D)"), 5);
  assert.equal(extractDividendPercent("10%(B)"), 0);
});

test("constituents with a temporarily unavailable price are retained", () => {
  const html = `
    <h2>KMIALLSHR Constituents</h2>
    <div class="tbl__wrapper"><table><tbody><tr>
      <td data-order="TEST">TEST</td><td>Test Company Limited</td><td>--</td>
    </tr></tbody></table></div>
  `;

  assert.deepEqual(parseIndexConstituents(html), [
    { symbol: "TEST", name: "Test Company Limited", latestPrice: 0 },
  ]);
});

test("archived PSX announcement-sheet dividends are parsed", () => {
  const text = `
1 MACTER
Macter International Limited
Annual
30-06-2024
Unconsolidated
Dividend
10% (F)
612.099 427.163 9.32 AGM
18-Oct-2024 25-Oct-2024
2 FNBM National Bank Modaraba
Annual
30-06-2024
- Nil 43.004 34.759 1.39 AGM
Board Meeting in Progress
`;

  assert.deepEqual(extractArchivePayouts(text, "2024-09-30"), [
    {
      symbol: "MACTER",
      announcedAt: "2024-09-30",
      periodLabel: "30/06/2024(YR)",
      periodEnd: "30/06/2024",
      detail: "10%(F) (D)",
      bookClosure: "18-Oct-2024 - 25-Oct-2024",
      fiscalYear: 2025,
      dividendPercent: 10,
      dividendPerShare: 1,
      archiveUrl:
        "https://dps.psx.com.pk/download/announce/2024-09-30.pdf",
    },
  ]);
  assert.equal(periodLabelForArchive("Nine Months", "30-09-2024"), "30/09/2024(IIIQ)");
  assert.equal(periodLabelForArchive("", "30-06-2024"), "30/06/2024");
});
