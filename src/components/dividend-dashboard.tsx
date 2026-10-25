"use client";

import { useState } from "react";
import { Icon } from "./ui-icon";
import { SnapshotMeta } from "./snapshot-meta";
import type {
  FiscalYearKey,
  FiscalYearSummary,
  Stock,
} from "@/lib/stocks";

const EMPTY_SUMMARY: FiscalYearSummary = {
  payoutCount: 0,
  intervalLabel: "",
  totalDividendPercent: 0,
  totalDividendPerShare: 0,
};

function fiscalYearKey(year: number): FiscalYearKey {
  return `fy${String(year).slice(-2)}`;
}

function fiscalYearLabel(year: number) {
  return String(year);
}

function fiscalYearRangeLabel(year: number) {
  return `Jan – Dec ${year}`;
}

function formatCurrency(value: number, digits = 2) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number, digits = 2) {
  return `${value.toFixed(digits)}%`;
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type DividendDashboardProps = {
  stocks: Stock[];
};

export function DividendDashboard({ stocks }: DividendDashboardProps) {
  const fiscalYears = stocks[0]?.fiscalYears ?? [];
  const currentFiscalYear =
    stocks[0]?.currentFiscalYear ?? fiscalYears.at(-1) ?? new Date().getFullYear();
  const fiscalTabs = fiscalYears.map((year) => ({
    key: fiscalYearKey(year),
    label: fiscalYearLabel(year),
    subtitle:
      year === currentFiscalYear
        ? `To date · ${fiscalYearRangeLabel(year)}`
        : fiscalYearRangeLabel(year),
  }));
  const [selectedYear, setSelectedYear] = useState<FiscalYearKey>(() =>
    fiscalYearKey(currentFiscalYear),
  );
  const [search, setSearch] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("100000");
  const [withholdingTax, setWithholdingTax] = useState("15");
  const [zakatRate, setZakatRate] = useState("0");
  const [faceValue, setFaceValue] = useState("10");

  const investment = Math.max(toNumber(investmentAmount), 0);
  const wht = Math.max(toNumber(withholdingTax), 0);
  const zakat = Math.max(toNumber(zakatRate), 0);
  const configuredFaceValue = Math.max(toNumber(faceValue), 0);
  const combinedDeduction = Math.min((wht + zakat) / 100, 1);
  const term = search.trim().toLowerCase();
  const rows = stocks
    .map((stock) => {
      const summary = stock.summary[selectedYear] ?? EMPTY_SUMMARY;
      const faceValueScale =
        stock.faceValueAssumption > 0
          ? configuredFaceValue / stock.faceValueAssumption
          : 1;
      const adjustedDividendPerShare =
        summary.totalDividendPerShare * faceValueScale;
      const sharesHeld = stock.latestPrice > 0 ? investment / stock.latestPrice : 0;
      const grossDividendCash = sharesHeld * adjustedDividendPerShare;
      const netDividendCash = grossDividendCash * (1 - combinedDeduction);
      const netYield = investment > 0 ? (netDividendCash / investment) * 100 : 0;

      return {
        symbol: stock.symbol,
        name: stock.name,
        latestPrice: stock.latestPrice,
        fiscalYearEndLabel: stock.fiscalYearEndLabel,
        companyUrl: stock.companyUrl,
        faceValueAssumption: stock.faceValueAssumption,
        summaries: stock.summary,
        payoutCount: summary.payoutCount,
        intervalLabel: summary.intervalLabel,
        totalDividendPercent: summary.totalDividendPercent,
        grossDividendCash,
        netDividendCash,
        netYield,
      };
    })
    .filter((row) => row.payoutCount > 0)
    .filter((row) => {
      if (!term) return true;
      return (
        row.symbol.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term)
      );
    })
    .sort(
      (a, b) =>
        b.netYield - a.netYield ||
        b.totalDividendPercent - a.totalDividendPercent ||
        a.symbol.localeCompare(b.symbol),
    );
  const derived = {
    rows,
    investment,
    sourceAsOf: stocks[0]?.sourceAsOf ?? "",
    dividendPayers: stocks.filter(
      (stock) => (stock.summary[selectedYear] ?? EMPTY_SUMMARY).payoutCount > 0,
    ).length,
    totalNetCash: rows.reduce((sum, row) => sum + row.netDividendCash, 0),
    topStock: rows[0] ?? null,
    configuredFaceValue,
  };
  const activeTab = fiscalTabs.find((tab) => tab.key === selectedYear) ?? {
    key: fiscalYearKey(currentFiscalYear),
    label: fiscalYearLabel(currentFiscalYear),
    subtitle: `To date · ${fiscalYearRangeLabel(currentFiscalYear)}`,
  };

  return (
    <main className="shell">
      <header className="market-header">
        <div className="market-title">
          <p className="eyebrow">Markets <span>/</span> KMIALLSHR</p>
          <h1>Dividend overview<span className="heading-dot">.</span></h1>
          <p className="lede">A clearer view of your dividend income. Compare payouts, yields, and returns.</p>
        </div>
        <SnapshotMeta date={derived.sourceAsOf} />
      </header>

      <section className="ticker-strip" aria-label="Portfolio summary">
        <div className="ticker-item">
          <div className="stat-heading"><span className="stat-label">Reporting year</span><Icon name="calendar" /></div>
          <strong>{activeTab.label}<span className="stat-tag">{selectedYear === fiscalYearKey(currentFiscalYear) ? "Year to date" : "Full year"}</span></strong>
          <span className="stat-detail">{fiscalYearRangeLabel(Number(activeTab.label))}</span>
        </div>
        <div className="ticker-item">
          <div className="stat-heading"><span className="stat-label">Dividend payers</span><Icon name="users" /></div>
          <strong>{derived.dividendPayers}<span className="stat-denominator">/ {stocks.length}</span></strong>
          <span className="stat-detail">KMIALLSHR constituents in {activeTab.label}</span>
        </div>
        <div className="ticker-item">
          <div className="stat-heading"><span className="stat-label">Estimated net income</span><Icon name="wallet" /></div>
          <strong className="cash-total">{formatCurrency(derived.totalNetCash, 0)}</strong>
          <span className="stat-detail">{formatCurrency(derived.investment, 0)} per displayed stock</span>
        </div>
        <div className="ticker-item is-primary">
          <div className="stat-heading"><span className="stat-label">Highest net yield</span><Icon name="arrow" /></div>
          <strong>{derived.topStock ? formatPercent(derived.topStock.netYield) : "0.00%"}</strong>
          <span className="stat-detail"><span className="stock-tag">{derived.topStock?.symbol ?? "—"}</span> After configured deductions</span>
        </div>
      </section>

      <section className="control-band" aria-label="Dividend filters">
        <div className="period-control">
          <div className="tab-row" role="group" aria-label="Calendar year">
            {fiscalTabs.map((tab) => (
              <button key={tab.key} type="button" aria-pressed={selectedYear === tab.key}
                className={selectedYear === tab.key ? "tab is-active" : "tab"}
                onClick={() => setSelectedYear(tab.key)}>
                {tab.label}<span>{tab.key === fiscalYearKey(currentFiscalYear) ? "YTD" : "Full year"}</span>
              </button>
            ))}
          </div>
          <span className="period-note">January – December</span>
        </div>
        <label className="search-field">
          <Icon name="search" />
          <input type="search" aria-label="Search symbol or company" value={search}
            onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol or company…" />
          {search && <button type="button" className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
        </label>
      </section>

      <details className="assumptions-panel">
        <summary>
          <span className="assumptions-title"><Icon name="settings" /> Holding assumptions</span>
          <span className="assumptions-preview">{formatCurrency(investment, 0)} / stock <span>·</span> {formatPercent(wht, 0)} WHT <span>·</span> {formatPercent(zakat, 0)} zakat</span>
          <span className="assumptions-edit">Adjust<Icon name="chevron" /></span>
        </summary>
        <div className="assumptions-content">
          <p>Adjust your investment and deductions to estimate the cash return on each holding.</p>
          <div className="field-grid">
            <label className="field"><span>Investment per stock (Rs)</span><input inputMode="decimal" value={investmentAmount} onChange={(event) => setInvestmentAmount(event.target.value)} /></label>
            <label className="field"><span>Withholding tax (%)</span><input inputMode="decimal" value={withholdingTax} onChange={(event) => setWithholdingTax(event.target.value)} /></label>
            <label className="field"><span>Zakat (%)</span><input inputMode="decimal" value={zakatRate} onChange={(event) => setZakatRate(event.target.value)} /></label>
            <label className="field"><span>Share face value (Rs)</span><input inputMode="decimal" value={faceValue} onChange={(event) => setFaceValue(event.target.value)} /></label>
          </div>
        </div>
      </details>

      <section className="table-panel market-surface" aria-labelledby="dividend-table-title">
        <div className="table-header">
          <div><h2 id="dividend-table-title">Dividend performance <span className="count-badge">{derived.rows.length}</span></h2>
            <p>Cash dividends per share, ranked by {activeTab.label} net yield.</p></div>
          <span className="table-context"><span className="status-dot" />{activeTab.label} {selectedYear === fiscalYearKey(currentFiscalYear) ? "year to date" : "full year"}</span>
        </div>
        <p className="mobile-table-hint">Scroll sideways to compare all columns<Icon name="chevron" /></p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Dividend performance table, scroll horizontally for more columns">
          <table>
            <thead><tr>
              <th scope="col">Company</th><th scope="col">Latest price</th>
              {fiscalTabs.map((tab) => <th scope="col" className={tab.key === selectedYear ? "selected-column" : ""} key={tab.key}>{tab.label} dividend <span className="column-subtitle">Per share / net yield</span></th>)}
              <th scope="col">Payout interval<span className="column-subtitle">{activeTab.label}</span></th>
              <th scope="col">Gross income<span className="column-subtitle">On your holding</span></th>
              <th scope="col">Net income<span className="column-subtitle">After deductions</span></th>
            </tr></thead>
            <tbody>
              {derived.rows.map((row, index) => (
                <tr key={row.symbol}>
                  <td><div className="company-cell"><span className="row-rank">{String(index + 1).padStart(2, "0")}</span>
                    <div className="stock-cell"><a href={row.companyUrl} target="_blank" rel="noreferrer">{row.symbol}<Icon name="arrow" /></a>
                      <span className="company-name" title={`${row.name} · Company year end: ${row.fiscalYearEndLabel}`}>{row.name}</span></div>
                  </div></td>
                  <td>{formatCurrency(row.latestPrice)}</td>
                  {fiscalTabs.map((tab) => {
                    const summary = row.summaries[tab.key] ?? EMPTY_SUMMARY;
                    const faceValueScale = configuredFaceValue / (row.faceValueAssumption || 10);
                    const dividendPerShare = summary.totalDividendPerShare * faceValueScale;
                    const yearNetYield = row.latestPrice > 0 ? (dividendPerShare / row.latestPrice) * (1 - combinedDeduction) * 100 : 0;
                    return (
                      <td key={tab.key} className={tab.key === selectedYear ? "selected-column" : ""}>
                        <div className="metric-stack"><div className="dividend-yield-line"><strong>{formatCurrency(dividendPerShare)}</strong>
                          <span className={yearNetYield > 0 ? "yield-badge" : "yield-badge is-zero"} title="Net dividend yield">{formatPercent(yearNetYield)}</span></div>
                          <span className="metric-detail">{formatPercent(summary.totalDividendPercent, 1)} · {summary.payoutCount || "No"} {summary.payoutCount === 1 ? "payout" : "payouts"}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td><span className="interval-badge">{row.intervalLabel || "None"}</span></td>
                  <td>{formatCurrency(row.grossDividendCash, 0)}</td>
                  <td className="net-cash">{formatCurrency(row.netDividendCash, 0)}</td>
                </tr>
              ))}
              {derived.rows.length === 0 && <tr><td colSpan={5 + fiscalTabs.length}><div className="empty-state"><Icon name="search" /><h3>No matching companies</h3><p>Try another company name or symbol, or choose a different year.</p><button type="button" onClick={() => setSearch("")}>Clear search</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>Showing {derived.rows.length} of {derived.dividendPayers} dividend payers</span><span>All amounts in PKR</span></div>
      </section>
      <footer className="page-footer">
        <p>January–December totals use announcement dates. Dividends assume a Rs {derived.configuredFaceValue.toFixed(2)} share face value.</p>
        <a href={stocks[0]?.indexUrl ?? "https://dps.psx.com.pk/indices/KMIALLSHR"} target="_blank" rel="noreferrer">Source: Pakistan Stock Exchange<Icon name="arrow" /></a>
      </footer>
    </main>
  );
}
