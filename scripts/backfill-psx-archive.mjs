import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ARCHIVE_BASE_URL = "https://dps.psx.com.pk/download/announce";
const ARCHIVE_START = "2024-07-01";
const ARCHIVE_END = "2024-12-31";
const FACE_VALUE_ASSUMPTION = 10;
const CONCURRENCY = 3;

function round(value) {
  return Number(value.toFixed(4));
}

function fiscalYearKey(year) {
  return `fy${String(year).slice(-2)}`;
}

function financialYearFromDateKey(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  return month >= 7 ? year + 1 : year;
}

function intervalLabelForCount(count) {
  if (count <= 0) return "";
  if (count === 1) return "Single";
  if (count === 2) return "Biannual";
  if (count === 3) return "Triannual";
  if (count === 4) return "Quarterly";
  return `${count} payouts`;
}

function dateKeysBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const finalDate = new Date(`${end}T00:00:00Z`);

  while (cursor <= finalDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function periodLabelForArchive(periodType, periodEnd) {
  const normalizedType = periodType.toLowerCase();
  let suffix = "";

  if (normalizedType === "annual") suffix = "YR";
  else if (normalizedType === "half year" || normalizedType === "2nd quarter") {
    suffix = "HYR";
  } else if (
    normalizedType === "nine months" ||
    normalizedType === "3rd quarter"
  ) {
    suffix = "IIIQ";
  } else if (
    normalizedType === "1st quarter" ||
    normalizedType === "first quarter"
  ) {
    suffix = "IQ";
  }

  const slashDate = periodEnd.replaceAll("-", "/");
  return suffix ? `${slashDate}(${suffix})` : slashDate;
}

function extractArchivePayouts(text, announcedAt) {
  const financialResults = text
    .replaceAll("\r", "")
    .split(/\n\s*Board Meeting in Progress/i)[0];
  const rowPattern = /^(\d+)\s+([A-Z][A-Z0-9-]{1,15})(?:\s|$)/gm;
  const rowStarts = [...financialResults.matchAll(rowPattern)];
  const payouts = [];

  for (let index = 0; index < rowStarts.length; index += 1) {
    const start = rowStarts[index].index;
    const end = rowStarts[index + 1]?.index ?? financialResults.length;
    const row = financialResults.slice(start, end);
    const symbol = rowStarts[index][2];
    const dividend = row.match(
      /\bDividend\s+([\d,.]+)%\s*(?:\(([^)\n]+)\))?/i,
    );
    const period = row.match(
      /\b(?:(Annual|Half Year|Nine Months|1st Quarter|First Quarter|2nd Quarter|3rd Quarter)\s+)?(\d{2}-\s*\d{2}-\d{4})\b/i,
    );

    if (!dividend || !period) {
      continue;
    }

    const dividendPercent = Number(dividend[1].replaceAll(",", ""));
    if (!Number.isFinite(dividendPercent) || dividendPercent <= 0) {
      continue;
    }

    const dividendKind = dividend[2]?.trim() ?? "";
    const closureDates = [...row.matchAll(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g)].map(
      (match) => match[0],
    );
    const normalizedPeriodEnd = period[2].replace(/\s+/g, "");
    const periodEnd = normalizedPeriodEnd.replaceAll("-", "/");

    payouts.push({
      symbol,
      announcedAt,
      periodLabel: periodLabelForArchive(
        period[1] ?? "",
        normalizedPeriodEnd,
      ),
      periodEnd,
      detail: `${dividendPercent}%${dividendKind ? `(${dividendKind})` : ""} (D)`,
      bookClosure: closureDates.slice(-2).join(" - "),
      fiscalYear: financialYearFromDateKey(announcedAt),
      dividendPercent: round(dividendPercent),
      dividendPerShare: round(
        (dividendPercent / 100) * FACE_VALUE_ASSUMPTION,
      ),
      archiveUrl: `${ARCHIVE_BASE_URL}/${announcedAt}.pdf`,
    });
  }

  return payouts;
}

async function downloadArchiveSheet(dateKey, archiveDirectory) {
  const filePath = path.join(archiveDirectory, `${dateKey}.pdf`);

  try {
    const existingPdf = await readFile(filePath);
    if (existingPdf.subarray(0, 4).toString() === "%PDF") {
      return filePath;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const response = await fetch(`${ARCHIVE_BASE_URL}/${dateKey}.pdf`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status} while fetching ${dateKey}`);
  }

  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.subarray(0, 4).toString() !== "%PDF") {
    process.stdout.write(
      `skipped archive ${dateKey}: PSX returned a non-PDF placeholder\n`,
    );
    return null;
  }

  await writeFile(filePath, pdf);
  return filePath;
}

async function extractPdfText(filePath) {
  const { stdout } = await execFileAsync(
    "pdftotext",
    ["-raw", filePath, "-"],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout;
}

async function runPool(items, task, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      results.push(await task(item));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function archivePayoutIdentity(payout) {
  return [payout.announcedAt, payout.periodEnd, payout.dividendPercent].join("|");
}

function normalizeArchivedPayout(payout) {
  if (!payout.archiveUrl) return payout;

  return {
    ...payout,
    periodLabel: payout.periodLabel.replace(/\s+/g, ""),
    periodEnd: payout.periodEnd.replace(/\s+/g, ""),
  };
}

function rebuildSummary(stock) {
  const summary = {};

  for (const year of stock.fiscalYears) {
    const payouts = stock.payouts.filter((payout) => payout.fiscalYear === year);
    summary[fiscalYearKey(year)] = {
      payoutCount: payouts.length,
      intervalLabel: intervalLabelForCount(payouts.length),
      totalDividendPercent: round(
        payouts.reduce((sum, payout) => sum + payout.dividendPercent, 0),
      ),
      totalDividendPerShare: round(
        payouts.reduce((sum, payout) => sum + payout.dividendPerShare, 0),
      ),
    };
  }

  return { ...stock, summary };
}

async function main() {
  const outputFile = path.join(process.cwd(), "data", "stocks.json");
  const temporaryOutputFile = `${outputFile}.tmp`;
  const archiveDirectory = path.join(
    process.cwd(),
    "tmp",
    "pdfs",
    "psx-announcements-2024-h2",
  );
  const stocks = JSON.parse(await readFile(outputFile, "utf8"));
  const currentSymbols = new Set(stocks.map((stock) => stock.symbol));

  await mkdir(archiveDirectory, { recursive: true });

  const dates = dateKeysBetween(ARCHIVE_START, ARCHIVE_END);
  const sheets = await runPool(
    dates,
    async (dateKey) => {
      const filePath = await downloadArchiveSheet(dateKey, archiveDirectory);
      if (!filePath) return { dateKey, payouts: [] };

      let text;
      try {
        text = await extractPdfText(filePath);
      } catch {
        process.stdout.write(
          `skipped archive ${dateKey}: PSX PDF is unreadable\n`,
        );
        return { dateKey, payouts: [] };
      }
      const payouts = extractArchivePayouts(text, dateKey).filter((payout) =>
        currentSymbols.has(payout.symbol),
      );
      process.stdout.write(
        `processed archive ${dateKey}: ${payouts.length} current-constituent payouts\n`,
      );
      return { dateKey, payouts };
    },
    CONCURRENCY,
  );

  const archivePayouts = sheets.flatMap((sheet) => sheet.payouts);
  const payoutsBySymbol = new Map();
  for (const payout of archivePayouts) {
    const symbolPayouts = payoutsBySymbol.get(payout.symbol) ?? [];
    symbolPayouts.push(payout);
    payoutsBySymbol.set(payout.symbol, symbolPayouts);
  }
  let added = 0;

  const updatedStocks = stocks.map((stock) => {
    const payouts = stock.payouts.map(normalizeArchivedPayout);
    const identities = new Set(payouts.map(archivePayoutIdentity));

    for (const payout of payoutsBySymbol.get(stock.symbol) ?? []) {
      const identity = archivePayoutIdentity(payout);
      if (identities.has(identity)) continue;

      identities.add(identity);
      payouts.push(payout);
      added += 1;
    }

    return rebuildSummary({
      ...stock,
      payouts: payouts.sort((a, b) =>
        a.announcedAt.localeCompare(b.announcedAt),
      ),
    });
  });

  await writeFile(
    temporaryOutputFile,
    `${JSON.stringify(updatedStocks, null, 2)}\n`,
  );
  await rename(temporaryOutputFile, outputFile);

  process.stdout.write(
    `added ${added} archived payouts from ${ARCHIVE_START} through ${ARCHIVE_END}\n`,
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

export { extractArchivePayouts, periodLabelForArchive };
