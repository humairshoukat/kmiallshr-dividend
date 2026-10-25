import assert from "node:assert/strict";
import test from "node:test";
import { applyFaceValue, parseQuotationFaceValues, requireFaceValueCoverage } from "./fetch-psx-face-values.mjs";
import { mergeArchivePayouts } from "./backfill-psx-archive.mjs";

const metadata = (faceValue) => ({
  faceValue, faceValueSourceUrl: "https://dps.psx.com.pk/download/quote/2026-10-23.pdf",
  faceValueSourceAsOf: "2026-10-23", faceValueSourcePage: 10,
});

test("quotation parser reads par values across equity sections, including decimals", () => {
  const text = `D A I LY Q U O TAT I O N S
MAIN BOARD (NORMAL COUNTER)
PAID UP CAPITAL                         PAR VALUE
SYMBOL CODE
1 Lucky Core Industries LCI 190.40 191.20 923.59 JUNE 600% 650% 525% 2.00 1 19/09 1957 311.00 201.17
2 K-Electric KEL 5.54 5.56 96,651.55 JUNE NIL NIL NIL 3.50 1 23/10 1949 8.40 3.69
3 BF Biosciences BFBIO 70.00 70.00 265.00 JUNE NIL 3.00 1 2024 99.00 55.00
23/10/2026 Page 1 of 2
\fMAIN BOARD (NON-COMPLIANT)
PAID UP CAPITAL                  PAR VALUE
SYMBOL CODE
1 Al-Abid Silk Mills AASM NT 134.10 JUNE NIL 10.00 1 21/10 1989 0.00 0
GEM BOARD
2 Pak Agro GEMBCEM 11.80 1,000.00 JUNE NL 6% 10.0000 1.00 21/10 2024 14.50 9.64
PUBLICLY ISSUED DEBT SECURITIES
3 Something TFC 5,000.00 1 2026
23/10/2026 Page 2 of 2`;
  const values = parseQuotationFaceValues(text);
  assert.equal(values.get("LCI").faceValue, 2);
  assert.equal(values.get("KEL").faceValue, 3.5);
  assert.equal(values.get("BFBIO").faceValue, 3);
  assert.equal(values.get("AASM").faceValue, 10);
  assert.equal(values.get("GEMBCEM").faceValue, 10);
  assert.equal(values.get("AASM").faceValueSourcePage, 2);
  assert.ok(!values.has("TFC"));
});

test("face-value lookup fails on missing or conflicting values instead of assuming ten", () => {
  assert.throws(() => parseQuotationFaceValues("a non-PDF placeholder"), /Not a PSX/);
  assert.throws(() => requireFaceValueCoverage([{ symbol: "UNKNOWN" }], new Map()), /Missing official face values for UNKNOWN/);
  const text = `PSX DAILY QUOTATIONS\nPAID UP CAPITAL PAR VALUE SYMBOL\n1 Lucky Core LCI 190.40 2.00 1 1957\n2 Lucky Core LCI 190.40 10.00 1 1957`;
  assert.throws(() => parseQuotationFaceValues(text), /Conflicting PSX par values for LCI/);
});

test("dividends use each stock's current face value and recalculate saved historical payouts", () => {
  const stock = { symbol: "TEST", fiscalYears: [2025, 2026], faceValueAssumption: 10, payouts: [
    { fiscalYear: 2025, dividendPercent: 100, dividendPerShare: 10 },
    { fiscalYear: 2026, dividendPercent: 50, dividendPerShare: 5 },
  ] };
  for (const faceValue of [1, 2, 3, 3.5, 5, 10]) {
    const record = applyFaceValue(stock, metadata(faceValue));
    assert.equal(record.summary.fy25.totalDividendPerShare, faceValue);
    assert.equal(record.summary.fy26.totalDividendPerShare, faceValue / 2);
    assert.equal(record.summary.fy25.totalDividendPercent, 100);
    assert.equal(record.dividendPerShareBasis, "current-face-value");
    assert.ok(!("faceValueAssumption" in record));
    assert.deepEqual(applyFaceValue(record, metadata(faceValue)), record);
  }
  for (const faceValue of [undefined, 0, -1, NaN]) {
    assert.throws(() => applyFaceValue(stock, metadata(faceValue)), /Missing verified face value/);
  }
});

test("historical archive merges retain company-specific face values", () => {
  const stock = { symbol: "LCI", fiscalYears: [2025, 2026], ...metadata(2), payouts: [] };
  const { updatedStocks } = mergeArchivePayouts([stock], [{
    symbol: "LCI", announcedAt: "2025-03-01", periodEnd: "31/12/2024", periodLabel: "31/12/2024(HYR)",
    fiscalYear: 2025, dividendPercent: 450, dividendPerShare: 45,
  }], "2026-10-25");
  assert.equal(updatedStocks[0].summary.fy25.totalDividendPerShare, 9);
  assert.equal(updatedStocks[0].payouts[0].dividendPerShare, 9);
  assert.equal(updatedStocks[0].faceValue, 2);
});
