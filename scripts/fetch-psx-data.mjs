import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { load } from "cheerio";

const INDEX_URL = "https://dps.psx.com.pk/indices/KMIALLSHR";
const PAYOUTS_URL = "https://dps.psx.com.pk/company/payouts";
const COMPANY_URL = "https://dps.psx.com.pk/company";
const FACE_VALUE_ASSUMPTION = 10;
const CONCURRENCY = 3;
let nextRequestAt = 0;

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

function fiscalYearKey(year) {
  return `fy${String(year).slice(-2)}`;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPSX(url, options = {}, attempts = 6) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const wait = Math.max(0, nextRequestAt - Date.now());
      nextRequestAt = Date.now() + wait + 1000;
      if (wait > 0) await sleep(wait);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        ...options,
        headers: {
          "user-agent": "kmiallshr-data-import/1.0",
          ...(options.headers ?? {}),
        },
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(15_000 * 2 ** (attempt - 1), 60_000);
        nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
        process.stdout.write(`PSX rate limit; retrying ${url} after ${delay / 1000}s\n`);
      }

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`${response.status} ${url}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }

  throw lastError;
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

function intervalLabelForCount(count) {
  if (count <= 0) return "";
  if (count === 1) return "Single";
  if (count === 2) return "Biannual";
  if (count === 3) return "Triannual";
  if (count === 4) return "Quarterly";
  return `${count} payouts`;
}

function zeroSummary() {
  return {
    payoutCount: 0,
    intervalLabel: "",
    totalDividendPercent: 0,
    totalDividendPerShare: 0,
  };
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

  const summaryBuckets = Object.fromEntries(
    fiscalYears.map((year) => [year, []]),
  );

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

    const dividendPerShare =
      (dividendPercent / 100) * FACE_VALUE_ASSUMPTION;

    const payout = {
      announcedAt: dateKey(announcedAt),
      periodLabel: row.periodLabel,
      periodEnd: periodEnd.raw,
      detail: row.detail,
      bookClosure: row.bookClosure,
      fiscalYear,
      dividendPercent: round(dividendPercent),
      dividendPerShare: round(dividendPerShare),
    };

    const previousPayout = [...payoutsByIdentity.values()].find((item) => payoutsMatch(item, payout));
    if (previousPayout) payoutsByIdentity.delete(payoutIdentity(previousPayout));
    payoutsByIdentity.set(payoutIdentity(payout), payout);
  }

  const payouts = [...payoutsByIdentity.values()];

  for (const payout of payouts) {
    summaryBuckets[payout.fiscalYear].push(payout);
  }

  const summary = Object.fromEntries(
    fiscalYears.map((year) => [fiscalYearKey(year), zeroSummary()]),
  );

  for (const fy of fiscalYears) {
    const key = fiscalYearKey(fy);
    const items = summaryBuckets[fy];
    summary[key] = {
      payoutCount: items.length,
      intervalLabel: intervalLabelForCount(items.length),
      totalDividendPercent: round(
        items.reduce((sum, item) => sum + item.dividendPercent, 0),
      ),
      totalDividendPerShare: round(
        items.reduce((sum, item) => sum + item.dividendPerShare, 0),
      ),
    };
  }

  return {
    symbol: stock.symbol,
    name: stock.name,
    latestPrice: round(stock.latestPrice),
    fiscalYearEndLabel,
    sourceAsOf,
    companyUrl: `${COMPANY_URL}/${stock.symbol}`,
    indexUrl: INDEX_URL,
    faceValueAssumption: FACE_VALUE_ASSUMPTION,
    fiscalYears,
    currentFiscalYear: fiscalYears.at(-1),
    summary,
    payouts: payouts.sort((a, b) => a.announcedAt.localeCompare(b.announcedAt)),
  };
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

  const records = await runPool(
    constituents,
    async (stock) => {
      const record = await buildStockRecord(
        stock,
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
