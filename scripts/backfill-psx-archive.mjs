import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { applyFaceValue } from "./fetch-psx-face-values.mjs";
import {
  fetchPSX,
  financialYearFromPayoutDate,
  getFiscalYearWindow,
  payoutsMatch,
  sourceDate,
} from "./fetch-psx-data.mjs";

const execFileAsync = promisify(execFile);
const ARCHIVE_BASE_URL = "https://dps.psx.com.pk/download/announce";
const CONCURRENCY = 3;

function round(value) {
  return Number(value.toFixed(4));
}

function financialYearFromDateKey(dateKey) {
  return financialYearFromPayoutDate(new Date(`${dateKey}T00:00:00Z`));
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
  const normalizedType = periodType.toLowerCase().replace(/\s+/g, " ");
  let suffix = "";

  if (normalizedType === "annual") suffix = "YR";
  else if (normalizedType === "half year" || normalizedType === "2nd quarter") {
    suffix = "HYR";
  } else if (
    normalizedType === "nine months" ||
    normalizedType === "nine month" ||
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
    .replaceAll("\f", "\n")
    .split(/\n\s*Board Meeting in Progress/i)[0];
  const rowPattern = /^(\d+)[ \t]+([A-Z][A-Z0-9-]{1,15})(?:[ \t]|$)/gim;
  const rowStarts = [...financialResults.matchAll(rowPattern)];
  const payouts = [];

  for (let index = 0; index < rowStarts.length; index += 1) {
    const start = rowStarts[index].index;
    const end = rowStarts[index + 1]?.index ?? financialResults.length;
    const row = financialResults.slice(start, end);
    const symbol = rowStarts[index][2].toUpperCase();
    const dividend = row.match(
      /\bDividend\s+([\d,.]+)%\s*(?:\(([^)\n]+)\))?/i,
    );
    const period = row.match(
      /\b(?:(Annual|Half\s+Year|Nine\s+Months?|1st\s+Quarter|First\s+Quarter|2nd\s+Quarter|3rd\s+Quarter)\s*)?(\d{2}-\s*\d{2}-\s*\d{4})\b/i,
    );

    if (!dividend || /already\s+announced|revised\s+dates?\s+of\s+book\s+closure/i.test(row)) {
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
    const normalizedPeriodEnd = period?.[2].replace(/\s+/g, "");
    const periodEnd = normalizedPeriodEnd?.replaceAll("-", "/") ?? announcedAt;

    payouts.push({
      symbol,
      announcedAt,
      periodLabel: period ? periodLabelForArchive(period[1] ?? "", normalizedPeriodEnd) : "-",
      periodEnd,
      detail: `${dividendPercent}%${dividendKind ? `(${dividendKind})` : ""} (D)`,
      bookClosure: closureDates.slice(-2).join(" - "),
      fiscalYear: financialYearFromDateKey(announcedAt),
      dividendPercent: round(dividendPercent),
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

  const response = await fetchPSX(`${ARCHIVE_BASE_URL}/${dateKey}.pdf`, {
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
  return [payout.announcedAt, payout.periodEnd.replace(/\s+/g, "")].join("|");
}

function normalizeArchivedPayout(payout) {
  if (!payout.archiveUrl) return payout;

  return {
    ...payout,
    periodLabel: payout.periodLabel.replace(/\s+/g, ""),
    periodEnd: payout.periodEnd.replace(/\s+/g, ""),
  };
}

async function collectArchivePayouts() {
  const fiscalYears = getFiscalYearWindow();
  const archiveStart = `${fiscalYears[0]}-01-01`;
  const archiveEnd = [sourceDate(), `${fiscalYears.at(-1)}-12-31`].sort()[0];
  const archiveDirectory = path.join(
    process.cwd(),
    "tmp",
    "pdfs",
    "psx-announcements-2025-2026",
  );

  await mkdir(archiveDirectory, { recursive: true });

  const dates = dateKeysBetween(archiveStart, archiveEnd);
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
        fiscalYears.includes(payout.fiscalYear),
      );
      process.stdout.write(
        `processed archive ${dateKey}: ${payouts.length} payouts\n`,
      );
      return { dateKey, payouts };
    },
    CONCURRENCY,
  );

  return {
    archiveStart,
    archiveEnd,
    archivePayouts: sheets.flatMap((sheet) => sheet.payouts),
  };
}

function mergeArchivePayouts(stocks, archivePayouts, archiveEnd) {
  const fiscalYears = getFiscalYearWindow();
  const payoutsBySymbol = new Map();
  for (const originalPayout of archivePayouts) {
    const payout = {
      ...originalPayout,
      fiscalYear: financialYearFromDateKey(originalPayout.announcedAt),
    };
    if (!fiscalYears.includes(payout.fiscalYear) || payout.announcedAt > archiveEnd) {
      continue;
    }
    const symbolPayouts = payoutsBySymbol.get(payout.symbol) ?? [];
    symbolPayouts.push(payout);
    payoutsBySymbol.set(payout.symbol, symbolPayouts);
  }
  let added = 0;

  const updatedStocks = stocks.map((stock) => {
    const normalizedPayouts = stock.payouts
      .map(normalizeArchivedPayout)
      .map((payout) => ({
        ...payout,
        fiscalYear: financialYearFromDateKey(payout.announcedAt),
      }))
      .filter((payout) =>
        fiscalYears.includes(payout.fiscalYear) && payout.announcedAt <= archiveEnd,
      );
    const payouts = [];
    for (const payout of normalizedPayouts) {
      const existingIndex = payouts.findIndex((existing) => payoutsMatch(existing, payout));
      if (existingIndex < 0) payouts.push(payout);
      else if (payouts[existingIndex].archiveUrl && !payout.archiveUrl) payouts[existingIndex] = payout;
    }
    const identities = new Set(payouts.map(archivePayoutIdentity));

    for (const payout of payoutsBySymbol.get(stock.symbol) ?? []) {
      const identity = archivePayoutIdentity(payout);
      if (identities.has(identity) || payouts.some((existing) => payoutsMatch(existing, payout))) continue;

      identities.add(identity);
      payouts.push(payout);
      added += 1;
    }

    return applyFaceValue({
      ...stock,
      fiscalYears,
      currentFiscalYear: fiscalYears.at(-1),
      payouts: payouts.sort((a, b) =>
        a.announcedAt.localeCompare(b.announcedAt),
      ),
    }, stock);
  });

  return { updatedStocks, added };
}

async function main() {
  const { archiveStart, archiveEnd, archivePayouts } = await collectArchivePayouts();
  const outputFile = path.join(process.cwd(), "data", "stocks.json");
  const temporaryOutputFile = `${outputFile}.tmp`;
  const stocks = JSON.parse(await readFile(outputFile, "utf8"));
  const { updatedStocks, added } = mergeArchivePayouts(stocks, archivePayouts, archiveEnd);
  await writeFile(
    temporaryOutputFile,
    `${JSON.stringify(updatedStocks, null, 2)}\n`,
  );
  await rename(temporaryOutputFile, outputFile);

  process.stdout.write(
    `added ${added} archived payouts from ${archiveStart} through ${archiveEnd}\n`,
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
  collectArchivePayouts,
  extractArchivePayouts,
  mergeArchivePayouts,
  periodLabelForArchive,
};
