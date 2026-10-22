import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStockRecord,
  extractDividendPercent,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  parseIndexConstituents,
} from "./fetch-psx-data.mjs";
import {
  extractArchivePayouts,
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
      [2025, 2026, 2027],
    );
    assert.equal(record.fiscalYearEndLabel, symbol === "FFC" ? "December" : "June");
    assert.equal(record.payouts.length, 1);
    assert.equal(record.payouts[0].dividendPerShare, 14.5);
    assert.equal(record.summary.fy27.totalDividendPerShare, 14.5);
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
        [2025, 2026, 2027],
      ),
      /PSX company page for FFC is missing its payout request ID/,
    );
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

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
