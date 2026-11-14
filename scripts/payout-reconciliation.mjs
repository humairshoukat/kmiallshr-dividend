import payoutAliases from "../data/psx-payout-aliases.json" with { type: "json" };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function closureIdentity(value = "") {
  const dates = [...value.matchAll(/\b(\d{2})[/-](\d{2}|[A-Za-z]{3,4})[/-](\d{4})\b/g)].map((match) => {
    const month = /^\d+$/.test(match[2]) ? Number(match[2]) : MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    const date = new Date(Date.UTC(Number(match[3]), month - 1, Number(match[1])));
    return month > 0 && date.getUTCMonth() === month - 1 && date.getUTCDate() === Number(match[1])
      ? date.toISOString().slice(0, 10) : null;
  });
  if (!dates.length || dates.includes(null)) return null;
  // Some PSX rows repeat each endpoint when joining duplicate table cells.
  const unique = [...new Set(dates)];
  if (unique.length > 2 || unique[0] > unique.at(-1)) return null;
  return [unique[0], unique.at(-1)].join("|");
}

function dividendKind(payout) {
  return payout.detail?.match(/\(([fivx]+)\)\s*\(D\)/i)?.[1].toLowerCase() ?? null;
}

function hasPeriod(payout) {
  return payout.periodEnd !== payout.announcedAt;
}

function payoutsMatch(left, right, symbol = left.symbol ?? right.symbol) {
  const leftKind = dividendKind(left);
  const rightKind = dividendKind(right);
  const sameAmount = left.dividendPercent === right.dividendPercent;
  const archive = left.archiveUrl ? left : right;
  const live = left.archiveUrl ? right : left;
  if (archive.archiveUrl && !live.archiveUrl && sameAmount && payoutAliases.some((alias) => alias.symbol === symbol
    && alias.archive.kind === dividendKind(archive) && alias.live.kind === dividendKind(live)
    && alias.dividendPercent === left.dividendPercent
    && alias.archive.announcedAt === archive.announcedAt && alias.archive.periodEnd === archive.periodEnd
    && alias.live.announcedAt === live.announcedAt && alias.live.periodEnd === live.periodEnd)) return true;
  if (leftKind && rightKind && leftKind !== rightKind) return false;
  const samePeriod = left.periodEnd.replace(/\s+/g, "") === right.periodEnd.replace(/\s+/g, "");
  if (left.announcedAt === right.announcedAt) {
    if (samePeriod) return true;
    if ((!hasPeriod(left) || !hasPeriod(right)) && sameAmount) return true;
  }
  // Broader matching reconciles archive copies only. Separate live events
  // must survive, including final and interim dividends with one closure.
  if (!left.archiveUrl && !right.archiveUrl) return false;
  if (!leftKind || !rightKind) return false;
  const leftClosure = closureIdentity(left.bookClosure);
  if (leftClosure && leftClosure === closureIdentity(right.bookClosure)) return true;
  const daysApart = Math.abs(Date.parse(left.announcedAt) - Date.parse(right.announcedAt)) / 86_400_000;
  return sameAmount && (
    (samePeriod && hasPeriod(left) && hasPeriod(right) && daysApart <= 31)
    || ((!hasPeriod(left) || !hasPeriod(right)) && daysApart <= 7)
  );
}

function reconcilePayouts(payouts, symbol) {
  // Later archive corrections supersede older sheets; live PSX payout rows
  // take precedence over archive copies, regardless of their posting dates.
  const ordered = [...payouts].sort((a, b) =>
    Number(Boolean(b.archiveUrl)) - Number(Boolean(a.archiveUrl))
    || a.announcedAt.localeCompare(b.announcedAt),
  );
  const result = [];
  for (const payout of ordered) {
    const matches = result.filter((existing) => payoutsMatch(existing, payout, symbol));
    if (matches.some((left, index) => matches.slice(index + 1).some((right) => !payoutsMatch(left, right, symbol)))) {
      throw new Error(`Ambiguous PSX payout matches for ${symbol ?? "stock"} on ${payout.announcedAt}; existing data was not changed.`);
    }
    if (matches.length) {
      for (const existing of matches) result.splice(result.indexOf(existing), 1);
    }
    result.push(payout);
  }
  return result.sort((a, b) => a.announcedAt.localeCompare(b.announcedAt));
}

export { payoutsMatch, reconcilePayouts };

