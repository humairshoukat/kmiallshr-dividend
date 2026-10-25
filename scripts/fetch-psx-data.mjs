import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";
import { fetchPSX } from "./psx-http.mjs";
import { applyFaceValue, fetchFaceValues, requireFaceValueCoverage } from "./fetch-psx-face-values.mjs";

const INDEX_URL = "https://dps.psx.com.pk/indices/KMIALLSHR";
const PAYOUTS_URL = "https://dps.psx.com.pk/company/payouts";
const COMPANY_URL = "https://dps.psx.com.pk/company";
const CONCURRENCY = 3;

function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function pakistanDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function getFiscalYearWindow() {
  return [2025, 2026];
}

function dateKey(date) {
  const { year, month, day } = pakistanDateParts(date);
  return [year, month, day]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join("-");
}

function sourceDate(date = new Date()) {
  return dateKey(date);
}

async function fetchText(url, options = {}) {
  const response = await fetchPSX(url, options);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function parseIndexConstituents(html) {
  const $ = load(html);
  const rows = [];

  $('h2:contains("KMIALLSHR Constituents")')
    .nextAll("div.tbl__wrapper")
    .first()
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).find("td");
      const symbol = $(cells[0]).attr("data-order");
      const name = clean($(cells[1]).text());
      const parsedPrice = Number(clean($(cells[2]).text()).replaceAll(",", ""));

      if (!symbol || !name) {
        return;
      }

      rows.push({
        symbol,
        name,
        latestPrice: Number.isFinite(parsedPrice) ? parsedPrice : 0,
      });
    });

  return rows;
}

function parseAnnouncementDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePeriodEnd(periodLabel, announcedAt) {
  const match = periodLabel.match(/(\d{2}\/\d{2}\/\d{4})/);

  if (match) {
    const [day, month, year] = match[1].split("/").map(Number);
    return { day, month, year, raw: match[1] };
  }

  if (announcedAt) {
    const { year, month, day } = pakistanDateParts(announcedAt);
    return {
      day,
      month,
      year,
      raw: dateKey(announcedAt),
    };
  }

  return null;
}

function financialYearFromPayoutDate(date) {
  return pakistanDateParts(date).year;
}

function extractDividendPercent(detail) {
  if (!detail.includes("(D)")) {
    return 0;
  }

  const beforeDividendMarker = detail.slice(0, detail.indexOf("(D)"));
  const matches = [...beforeDividendMarker.matchAll(/([\d,.]+)/g)];
  const nearestNumber = matches.at(-1)?.[1]?.replaceAll(",", "");
  const parsed = Number(nearestNumber);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Number(value.toFixed(4));
}

async function fetchCompanyPayouts(symbol, requestId) {
  const html = await fetchText(PAYOUTS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-req-id": requestId,
      "x-requested-with": "XMLHttpRequest",
    },
    body: `symbol=${encodeURIComponent(symbol)}`,
  });

  const $ = load(html);
  const rows = [];

  $("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => clean($(cell).text()))
      .get();

    if (cells.length < 4) {
      return;
    }

    rows.push({
      announcedAtLabel: cells[0],
      periodLabel: cells[1],
      detail: cells[2],
      bookClosure: cells[3],
    });
  });

  return rows;
}

async function fetchCompanyDetails(symbol) {
  const html = await fetchText(`${COMPANY_URL}/${symbol}`);
  const $ = load(html);
  // PSX's AJAX setup sends window.__ps._k as X-Req-Id. Without it,
  // the payout endpoint returns 404 even for valid symbols.
  const configScript = $("script")
    .map((_, script) => $(script).text())
    .get()
    .find((script) => /window\.__ps\s*=/.test(script));
  const configJson = configScript?.match(/window\.__ps\s*=\s*(\{[\s\S]*?\})\s*;/)?.[1];
  const requestId = configJson ? JSON.parse(configJson)._k : null;

  if (typeof requestId !== "string" || !requestId.trim()) {
    throw new Error(
      `PSX company page for ${symbol} is missing its payout request ID; existing data was not changed.`,
    );
  }

  let fiscalYearEndLabel = "June";

  $("div.item__head").each((_, head) => {
    if (clean($(head).text()) === "Fiscal Year End") {
      fiscalYearEndLabel = clean($(head).next("p").text()) || "June";
    }
  });

  return { fiscalYearEndLabel, requestId };
}

function payoutIdentity(payout) {
  // Archive and live feeds can use different suffixes for the same period.
  return [payout.announcedAt, payout.periodEnd.replace(/\s+/g, "")].join("|");
}

function payoutsMatch(left, right) {
  if (left.announcedAt !== right.announcedAt) return false;
  if (payoutIdentity(left) === payoutIdentity(right)) return true;
  // When PSX omits the period, the announcement date is the fallback period end.
  return (left.periodEnd === left.announcedAt || right.periodEnd === right.announcedAt)
    && left.dividendPercent === right.dividendPercent;
}

async function buildStockRecord(
  stock,
  sourceAsOf,
  fiscalYears,
  previousRecord,
) {
  const { fiscalYearEndLabel, requestId } = await fetchCompanyDetails(stock.symbol);
  const payoutRows = await fetchCompanyPayouts(stock.symbol, requestId);
  const dividendRows = payoutRows.filter((row) => row.detail.includes("(D)"));

  const payoutsByIdentity = new Map();

  for (const payout of previousRecord?.payouts ?? []) {
    const announcedAt = parseAnnouncementDate(payout.announcedAt);

    if (!announcedAt) {
      continue;
    }

    const fiscalYear = financialYearFromPayoutDate(announcedAt);

    if (fiscalYears.includes(fiscalYear) && dateKey(announcedAt) <= sourceAsOf) {
      const reassignedPayout = { ...payout, fiscalYear };
      const existingPayout = [...payoutsByIdentity.values()].find((item) => payoutsMatch(item, reassignedPayout));
      if (existingPayout && !existingPayout.archiveUrl && reassignedPayout.archiveUrl) continue;
      if (existingPayout) payoutsByIdentity.delete(payoutIdentity(existingPayout));
      payoutsByIdentity.set(
        payoutIdentity(reassignedPayout),
        reassignedPayout,
      );
    }
  }

  for (const row of dividendRows) {
    const announcedAt = parseAnnouncementDate(row.announcedAtLabel);
    const periodEnd = parsePeriodEnd(row.periodLabel, announcedAt);

    if (!announcedAt || !periodEnd) {
      continue;
    }

    const fiscalYear = financialYearFromPayoutDate(announcedAt);

    if (!fiscalYears.includes(fiscalYear) || dateKey(announcedAt) > sourceAsOf) {
      continue;
    }

    const dividendPercent = extractDividendPercent(row.detail);
    if (!dividendPercent) {
      continue;
    }

    const payout = {
      announcedAt: dateKey(announcedAt),
      periodLabel: row.periodLabel,
      periodEnd: periodEnd.raw,
      detail: row.detail,
      bookClosure: row.bookClosure,
      fiscalYear,
      dividendPercent: round(dividendPercent),
    };

    const previousPayout = [...payoutsByIdentity.values()].find((item) => payoutsMatch(item, payout));
    if (previousPayout) payoutsByIdentity.delete(payoutIdentity(previousPayout));
    payoutsByIdentity.set(payoutIdentity(payout), payout);
  }

  const payouts = [...payoutsByIdentity.values()];

  return applyFaceValue({
    symbol: stock.symbol,
    name: stock.name,
    latestPrice: round(stock.latestPrice),
    fiscalYearEndLabel,
    sourceAsOf,
    companyUrl: `${COMPANY_URL}/${stock.symbol}`,
    indexUrl: INDEX_URL,
    fiscalYears,
    currentFiscalYear: fiscalYears.at(-1),
    payouts: payouts.sort((a, b) => a.announcedAt.localeCompare(b.announcedAt)),
  }, stock);
}

async function runPool(items, task, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      const result = await task(current);
      if (result) {
        results.push(result);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return results;
}

async function main() {
  const outputDir = path.join(process.cwd(), "data");
  const outputFile = path.join(outputDir, "stocks.json");
  const temporaryOutputFile = `${outputFile}.tmp`;
  const now = new Date();
  const sourceAsOf = sourceDate(now);
  const fiscalYears = getFiscalYearWindow();
  let previousRecords = [];

  try {
    previousRecords = JSON.parse(await readFile(outputFile, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const previousRecordsBySymbol = new Map(
    previousRecords.map((record) => [record.symbol, record]),
  );

  const indexHtml = await fetchText(INDEX_URL);
  const constituents = parseIndexConstituents(indexHtml);

  if (constituents.length === 0) {
    throw new Error("PSX returned no KMIALLSHR constituents; existing data was not changed.");
  }

  const faceValues = await fetchFaceValues(sourceAsOf);
  requireFaceValueCoverage(constituents, faceValues);

  const records = await runPool(
    constituents,
    async (stock) => {
      const record = await buildStockRecord(
        { ...stock, ...faceValues.get(stock.symbol) },
        sourceAsOf,
        fiscalYears,
        previousRecordsBySymbol.get(stock.symbol),
      );
      process.stdout.write(`processed ${record.symbol}\n`);
      return record;
    },
    CONCURRENCY,
  );

  const sorted = records.sort((a, b) => a.symbol.localeCompare(b.symbol));

  await mkdir(outputDir, { recursive: true });
  if (sorted.length !== constituents.length) {
    throw new Error(
      `Expected ${constituents.length} records but built ${sorted.length}; existing data was not changed.`,
    );
  }

  await writeFile(temporaryOutputFile, `${JSON.stringify(sorted, null, 2)}\n`);
  await rename(temporaryOutputFile, outputFile);

  process.stdout.write(
    `wrote all ${sorted.length} current KMIALLSHR records for calendar years ${fiscalYears.join(" and ")} to ${outputFile}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  buildStockRecord,
  extractDividendPercent,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  parseIndexConstituents,
  sourceDate,
  fetchPSX,
  payoutsMatch,
};
