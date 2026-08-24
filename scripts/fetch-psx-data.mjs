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

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

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

function getFiscalYearWindow(date = new Date()) {
  const { year, month } = pakistanDateParts(date);
  const currentFiscalYear = month >= 7 ? year + 1 : year;

  return Array.from(
    { length: 3 },
    (_, index) => currentFiscalYear - 2 + index,
  );
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

async function fetchText(url, options = {}, attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "kmiallshr-data-import/1.0",
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${url}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
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
  const { year, month } = pakistanDateParts(date);

  return month >= 7 ? year + 1 : year;
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

async function fetchCompanyPayouts(symbol) {
  const html = await fetchText(PAYOUTS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
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

async function fetchFiscalYearEnd(symbol) {
  const html = await fetchText(`${COMPANY_URL}/${symbol}`);
  const $ = load(html);
  let fiscalYearEndLabel = "June";

  $("div.item__head").each((_, head) => {
    if (clean($(head).text()) === "Fiscal Year End") {
      fiscalYearEndLabel = clean($(head).next("p").text()) || "June";
    }
  });

  const fiscalYearEndMonth = MONTHS[fiscalYearEndLabel.toLowerCase()] ?? 6;

  return {
    fiscalYearEndLabel,
    fiscalYearEndMonth,
  };
}

function payoutIdentity(payout) {
  return [payout.announcedAt, payout.periodLabel].join("|");
}

async function buildStockRecord(
  stock,
  sourceAsOf,
  fiscalYears,
  previousRecord,
) {
  const payoutRows = await fetchCompanyPayouts(stock.symbol);
  const dividendRows = payoutRows.filter((row) => row.detail.includes("(D)"));

  const fiscal = await fetchFiscalYearEnd(stock.symbol);
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

    if (fiscalYears.includes(fiscalYear)) {
      const reassignedPayout = { ...payout, fiscalYear };
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

    if (!fiscalYears.includes(fiscalYear)) {
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
    fiscalYearEndLabel: fiscal.fiscalYearEndLabel,
    fiscalYearEndMonth: fiscal.fiscalYearEndMonth,
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
  const fiscalYears = getFiscalYearWindow(now);
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
    `wrote all ${sorted.length} current KMIALLSHR records for FY${String(fiscalYears[0]).slice(-2)}–FY${String(fiscalYears.at(-1)).slice(-2)} to ${outputFile}\n`,
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
  extractDividendPercent,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  parseIndexConstituents,
};
