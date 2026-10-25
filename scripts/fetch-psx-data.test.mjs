import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStockRecord,
  extractDividendPercent,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  parseIndexConstituents,
  payoutsMatch,
} from "./fetch-psx-data.mjs";
import {
  extractArchivePayouts,
  mergeArchivePayouts,
  periodLabelForArchive,
} from "./backfill-psx-archive.mjs";

test("payout requests use the request ID from each company page", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url === "https://dps.psx.com.pk/company/FFC") {
      return new Response(`
        <script>window.__ps = {"lc":"en","_k":"ffc-request-id"};</script>
        <div class="item__head">Fiscal Year End</div><p>December</p>
      `);
    }
    if (url === "https://dps.psx.com.pk/company/EFERT") {
      return new Response(`
        <script>window.__ps = {"lc":"en","_k":"efert-request-id"};</script>
      `);
    }
    assert.equal(url, "https://dps.psx.com.pk/company/payouts");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(options.headers["x-requested-with"], "XMLHttpRequest");
    const symbol = new URLSearchParams(options.body).get("symbol");
    assert.equal(options.headers["x-req-id"], `${symbol.toLowerCase()}-request-id`);
    return new Response(`<table><tbody><tr>
      <td>July 29, 2026 3:23 PM</td><td>30/06/2026(HYR)</td>
      <td>145%(ii) (D)</td><td>11/08/2026 - 13/08/2026</td>
    </tr></tbody></table>`);
  });

  for (const symbol of ["FFC", "EFERT"]) {
    const record = await buildStockRecord(
      { symbol, name: symbol, latestPrice: 500 },
      "2026-10-22",
      [2025, 2026],
    );
    assert.equal(record.fiscalYearEndLabel, symbol === "FFC" ? "December" : "June");
    assert.equal(record.payouts.length, 1);
    assert.equal(record.payouts[0].dividendPerShare, 14.5);
    assert.equal(record.summary.fy26.totalDividendPerShare, 14.5);
  }
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, "https://dps.psx.com.pk/company/FFC");
  assert.equal(requests[2].url, "https://dps.psx.com.pk/company/EFERT");
});

test("missing payout request IDs stop the import before requesting payouts", async (t) => {
  for (const config of ["", '<script>window.__ps = {"lc":"en"};</script>']) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(config));
    await assert.rejects(
      buildStockRecord(
        { symbol: "FFC", name: "FFC", latestPrice: 500 },
        "2026-10-22",
        [2025, 2026],
      ),
      /PSX company page for FFC is missing its payout request ID/,
    );
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

test("refresh migrates saved payouts into calendar years and replaces archive duplicates", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => new Response(
    url.endsWith("/company/FFC")
      ? '<script>window.__ps = {"_k":"request-id"};</script>'
      : `<table><tbody>
          <tr><td>July 29, 2026 3:23 PM</td><td>30/06/2026(HYR)</td><td>145%(ii) (D)</td><td></td></tr>
          <tr><td>December 31, 2024 3:23 PM</td><td>30/09/2024(IIIQ)</td><td>10% (D)</td><td></td></tr>
          <tr><td>December 1, 2026 3:23 PM</td><td>30/09/2026(IIIQ)</td><td>10% (D)</td><td></td></tr>
        </tbody></table>`,
  ));
  const previousRecord = {
    payouts: [
      { announcedAt: "2024-12-31", fiscalYear: 2025, periodEnd: "30/09/2024", dividendPercent: 10, dividendPerShare: 1 },
      { announcedAt: "2025-07-29", fiscalYear: 2026, periodEnd: "30/06/2025", dividendPercent: 20, dividendPerShare: 2 },
      { announcedAt: "2025-07-29", fiscalYear: 2026, periodEnd: "2025-07-29", dividendPercent: 20, dividendPerShare: 2, archiveUrl: "archive" },
      { announcedAt: "2026-07-29", fiscalYear: 2027, periodEnd: "30/06/2026", periodLabel: "30/06/2026", dividendPercent: 140, dividendPerShare: 14, archiveUrl: "archive" },
    ],
  };
  const record = await buildStockRecord(
    { symbol: "FFC", name: "FFC", latestPrice: 500 },
    "2026-10-25", getFiscalYearWindow(), previousRecord,
  );
  assert.deepEqual(record.fiscalYears, [2025, 2026]);
  assert.equal(record.currentFiscalYear, 2026);
  assert.deepEqual(Object.keys(record.summary), ["fy25", "fy26"]);
  assert.deepEqual(record.payouts.map((p) => [p.announcedAt, p.fiscalYear]), [
    ["2025-07-29", 2025], ["2026-07-29", 2026],
  ]);
  assert.equal(record.summary.fy25.totalDividendPerShare, 2);
  assert.equal(record.summary.fy26.totalDividendPerShare, 14.5);
  assert.equal(record.summary.fy26.payoutCount, 1);
});

test("the reporting window contains only the requested calendar years", () => {
  assert.deepEqual(getFiscalYearWindow(), [2025, 2026]);
});

test("payouts use January through December in Pakistan time", () => {
  assert.equal(
    financialYearFromPayoutDate(new Date("2024-07-01T00:00:00Z")),
    2024,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2025-06-30T00:00:00Z")),
    2025,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2025-07-01T00:00:00Z")),
    2025,
  );
  assert.equal(
    financialYearFromPayoutDate(new Date("2026-07-01T00:00:00Z")),
    2026,
  );
  assert.equal(financialYearFromPayoutDate(new Date("2025-12-31T18:59:59Z")), 2025);
  assert.equal(financialYearFromPayoutDate(new Date("2025-12-31T19:00:00Z")), 2026);
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
      fiscalYear: 2024,
      dividendPercent: 10,
      dividendPerShare: 1,
      archiveUrl:
        "https://dps.psx.com.pk/download/announce/2024-09-30.pdf",
    },
  ]);
  assert.equal(periodLabelForArchive("Nine Months", "30-09-2024"), "30/09/2024(IIIQ)");
  assert.equal(periodLabelForArchive("", "30-06-2024"), "30/06/2024");
});

test("archive page breaks keep dividends attached to the correct symbol", () => {
  const payouts = extractArchivePayouts(`1 FIRST First Company
Annual\n31-12-2024\n- Nil
\f2 SECOND Second Company
Nine Month\n30-09-\n2025\nDividend\n25%(iii)
`, "2025-10-23");
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].symbol, "SECOND");
  assert.equal(payouts[0].fiscalYear, 2025);
  assert.equal(payouts[0].periodLabel, "30/09/2025(IIIQ)");
});

test("archive merging preserves live values, fills history, and excludes other years", () => {
  const payout = (announcedAt, dividendPercent, fiscalYear) => ({
    announcedAt, dividendPercent, dividendPerShare: dividendPercent / 10,
    fiscalYear, periodEnd: "30/06/2025", periodLabel: "30/06/2025(HYR)",
  });
  const stock = { symbol: "TEST", latestPrice: 123, fiscalYears: [2025, 2026, 2027], payouts: [
    payout("2024-12-31", 10, 2025), payout("2025-07-01", 20, 2026),
    { ...payout("2025-07-01", 20, 2026), periodEnd: "2025-07-01", archiveUrl: "archive" },
  ] };
  const { updatedStocks, added } = mergeArchivePayouts([stock], [
    { ...payout("2025-07-01", 15, 2026), symbol: "TEST", periodLabel: "30/06/2025" },
    { ...payout("2026-02-01", 30, 2026), symbol: "TEST" },
    { ...payout("2024-02-01", 50, 2024), symbol: "TEST" },
    { ...payout("2026-12-01", 50, 2026), symbol: "TEST" },
  ], "2026-10-25");
  assert.equal(added, 1);
  const record = updatedStocks[0];
  assert.equal(record.latestPrice, 123);
  assert.deepEqual(record.fiscalYears, [2025, 2026]);
  assert.equal(record.currentFiscalYear, 2026);
  assert.equal(record.payouts.length, 2);
  assert.equal(record.summary.fy25.totalDividendPerShare, 2);
  assert.equal(record.summary.fy26.totalDividendPerShare, 3);
  assert.deepEqual(Object.keys(record.summary), ["fy25", "fy26"]);
});

test("archives accept compact dates, mixed-case symbols, and unspecified periods", () => {
  const payouts = extractArchivePayouts(`1 NRSl Nimir Resins
Annual30-06-\n2026\nDividend\n15%(F)
2 WAHN Wah Noble Chemicals
-\nDividend\n100%(F)
3 SPEL SPEL Limited
-\nDividend\n6%(ii)
Revised dates of Book Closure for the Entitlement of Dividend already announced by Company
`, "2026-09-11");
  assert.deepEqual(payouts.map(p=>p.symbol),["NRSL","WAHN"]);
  assert.equal(payouts[0].periodLabel,"30/06/2026(YR)");
  assert.equal(payouts[1].periodLabel,"-");
  assert.equal(payouts[1].periodEnd,"2026-09-11");
  assert.ok(payoutsMatch(payouts[1],{...payouts[1],periodEnd:"30/06/2026"}));
  assert.ok(!payoutsMatch(payouts[1],{...payouts[1],dividendPercent:50,periodEnd:"30/06/2026"}));
});
