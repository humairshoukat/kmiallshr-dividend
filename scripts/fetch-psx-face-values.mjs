import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { fetchPSX } from "./psx-http.mjs";

const execFileAsync = promisify(execFile);
const QUOTATION_BASE_URL = "https://dps.psx.com.pk/download/quote";

function round(value) {
  return Number(value.toFixed(4));
}

function intervalLabel(count) {
  return ["", "Single", "Biannual", "Triannual", "Quarterly"][count] ?? `${count} payouts`;
}

function parseQuotationFaceValues(text) {
  if (!text.replace(/\s+/g, "").toUpperCase().includes("DAILYQUOTATIONS")) {
    throw new Error("Not a PSX daily quotation sheet; existing data was not changed.");
  }
  const values = new Map();
  for (const [index, page] of text.split("\f").entries()) {
    // Only equity tables have all these headers. Debt face values and prices
    // must never be mistaken for the par value of ordinary shares.
    if (!/PAID\s+UP/.test(page) || !/\bPAR\b/.test(page) || !/\bSYMBOL\b/.test(page)) continue;
    for (const line of page.split("\n")) {
      const row = line.match(/^\s*\d+\s+.+?\s+([A-Z0-9][A-Z0-9-]{1,15})\s+(?:[\d.,]+|NT|TN)(?=\s)/);
      if (!row) continue;
      // PAR VALUE, market lot, optional book-closure day/month, listing year.
      // Anchor to this sequence rather than a fixed character column: widths
      // differ between main, GEM, non-compliant, and suspended sections.
      const matches = [...line.matchAll(/\s+(\d+(?:\.\d+)?)[ \t]+(\d+(?:\.\d+)?)[ \t]+(?:(\d{2}\/\d{2})[ \t]+)?((?:19|20)\d{2})\b/g)];
      if (matches.length !== 1) continue;
      const faceValue = Number(matches[0][1]);
      if (!Number.isFinite(faceValue) || faceValue <= 0) continue;
      const symbol = row[1];
      if (values.has(symbol) && values.get(symbol).faceValue !== faceValue) {
        throw new Error(`Conflicting PSX par values for ${symbol}; existing data was not changed.`);
      }
      values.set(symbol, { faceValue, faceValueSourcePage: index + 1 });
    }
  }
  if (values.size === 0) throw new Error("PSX quotation contained no readable equity par values.");
  return values;
}

function requireFaceValueCoverage(stocks, values) {
  const missing = stocks.filter((stock) => !values.has(stock.symbol)).map((stock) => stock.symbol);
  if (missing.length) {
    throw new Error(`Missing official face values for ${missing.join(", ")}; existing data was not changed.`);
  }
}

function applyFaceValue(stock, metadata) {
  const { faceValue, faceValueSourceUrl, faceValueSourceAsOf, faceValueSourcePage } = metadata;
  if (!Number.isFinite(faceValue) || faceValue <= 0 || !faceValueSourceUrl || !faceValueSourceAsOf || !Number.isInteger(faceValueSourcePage) || faceValueSourcePage <= 0) {
    throw new Error(`Missing verified face value for ${stock.symbol}; existing data was not changed.`);
  }
  const payouts = stock.payouts.map((payout) => ({
    ...payout,
    // Express every dividend on today's nominal share basis. This normalizes
    // pre-split percentages to current shares without inventing historical
    // cash amounts or effective dates for corporate actions.
    dividendPerShare: round((payout.dividendPercent / 100) * faceValue),
  }));
  const summary = Object.fromEntries(stock.fiscalYears.map((year) => {
    const items = payouts.filter((payout) => payout.fiscalYear === year);
    return [`fy${String(year).slice(-2)}`, {
      payoutCount: items.length,
      intervalLabel: intervalLabel(items.length),
      totalDividendPercent: round(items.reduce((sum, payout) => sum + payout.dividendPercent, 0)),
      totalDividendPerShare: round(items.reduce((sum, payout) => sum + payout.dividendPerShare, 0)),
    }];
  }));
  const result = {
    ...stock,
    faceValue,
    faceValueSourceUrl,
    faceValueSourceAsOf,
    faceValueSourcePage,
    dividendPerShareBasis: "current-face-value",
    payouts,
    summary,
  };
  delete result.faceValueAssumption;
  return result;
}

async function fetchFaceValues(asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Face-value lookup requires an ISO date.");
  const cursor = new Date(`${asOf}T00:00:00Z`);
  const cacheDirectory = path.join(process.cwd(), "tmp", "pdfs", "psx-quotations");
  await mkdir(cacheDirectory, { recursive: true });

  // Non-trading days have no quotation PDF. Use the most recent published
  // sheet, keep its actual date, and never fall back to an assumed Rs 10.
  for (let daysBack = 0; daysBack < 14; daysBack += 1) {
    const date = cursor.toISOString().slice(0, 10);
    const url = `${QUOTATION_BASE_URL}/${date}.pdf`;
    const filePath = path.join(cacheDirectory, `${date}.pdf`);
    let pdf;
    try {
      pdf = await readFile(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!pdf || pdf.subarray(0, 4).toString() !== "%PDF") {
      const response = await fetchPSX(url);
      if (response.status !== 403 && response.status !== 404) {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        pdf = Buffer.from(await response.arrayBuffer());
        if (pdf.subarray(0, 4).toString() === "%PDF") await writeFile(filePath, pdf);
      }
    }
    if (pdf?.subarray(0, 4).toString() === "%PDF") {
      const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 20 * 1024 * 1024 });
      const printedDates = [...stdout.matchAll(/^(\d{2})\/(\d{2})\/(\d{4})\s+Page\s+\d+\s+of\s+\d+/gm)]
        .map((match) => `${match[3]}-${match[2]}-${match[1]}`);
      if (!printedDates.length || printedDates.some((printedDate) => printedDate !== date)) {
        throw new Error(`PSX quotation date does not match ${date}; existing data was not changed.`);
      }
      return new Map([...parseQuotationFaceValues(stdout)].map(([symbol, value]) => [symbol, {
        ...value, faceValueSourceUrl: url, faceValueSourceAsOf: date,
      }]));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  throw new Error(`No PSX quotation sheet found in the 14 days ending ${asOf}; existing data was not changed.`);
}

async function main() {
  const outputFile = path.join(process.cwd(), "data", "stocks.json");
  const stocks = JSON.parse(await readFile(outputFile, "utf8"));
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const values = await fetchFaceValues(asOf);
  requireFaceValueCoverage(stocks, values);
  const updatedStocks = stocks.map((stock) => applyFaceValue(stock, values.get(stock.symbol)));
  await writeFile(`${outputFile}.tmp`, `${JSON.stringify(updatedStocks, null, 2)}\n`);
  await rename(`${outputFile}.tmp`, outputFile);
  process.stdout.write(`Updated official face values for all ${updatedStocks.length} stocks using the ${updatedStocks[0].faceValueSourceAsOf} PSX quotation sheet.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

export { applyFaceValue, fetchFaceValues, parseQuotationFaceValues, requireFaceValueCoverage };
