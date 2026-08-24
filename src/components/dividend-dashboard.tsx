"use client";

import { useState } from "react";
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
  return `FY${String(year).slice(-2)}`;
}

function fiscalYearRangeLabel(year: number) {
  return `Jul ${year - 1} – Jun ${year}`;
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
    <div className="shell">
      <header className="market-header">
        <div className="market-title">
          <p className="eyebrow text-xs">PSX dividend board</p>
          <h1>KMIALLSHR Income Monitor</h1>
          <p className="lede text-sm">
            Constituents and latest prices are sourced from the official{" "}
            <a
              href={stocks[0]?.indexUrl ?? "https://dps.psx.com.pk/indices/KMIALLSHR"}
              target="_blank"
              rel="noreferrer"
            >
              PSX KMIALLSHR constituent page
            </a>
            ; dividend rows come from each stock&apos;s PSX payout feed.
          </p>
        </div>

        <div className="market-meta">
          <div>
            <span className="stat-label">Snapshot</span>
            <strong>{derived.sourceAsOf || "N/A"}</strong>
          </div>
          <div>
            <span className="stat-label">Universe</span>
            <strong>KMIALLSHR</strong>
          </div>
        </div>
      </header>

      <section className="ticker-strip" aria-label="Portfolio summary">
        <div className="ticker-item">
          <span className="stat-label">Selected FY</span>
          <strong>{activeTab.label}</strong>
          <span className="text-xs">{activeTab.subtitle}</span>
        </div>
        <div className="ticker-item">
          <span className="stat-label">Constituents</span>
          <strong>{stocks.length}</strong>
          <span className="text-xs">{derived.dividendPayers} paid in {activeTab.label}</span>
        </div>
        <div className="ticker-item">
          <span className="stat-label">Net cash if held equally</span>
          <strong>{formatCurrency(derived.totalNetCash, 0)}</strong>
          <span className="text-xs">{formatCurrency(derived.investment, 0)} per stock</span>
        </div>
        <div className="ticker-item is-primary">
          <span className="stat-label">Top net yield</span>
          <strong>
            {derived.topStock ? formatPercent(derived.topStock.netYield) : "0.00%"}
          </strong>
          <span className="text-xs">{derived.topStock?.symbol ?? "No rows"}</span>
        </div>
      </section>

      <section className="control-band">
        <div className="control-group fiscal-group">
          <div className="control-heading">
            <p className="eyebrow text-xs">Fiscal year</p>
            <h2>Return period</h2>
          </div>
          <div className="tab-row" role="tablist" aria-label="Fiscal year tabs">
            {fiscalTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selectedYear === tab.key}
                className={selectedYear === tab.key ? "tab text-sm is-active" : "tab text-sm"}
                onClick={() => setSelectedYear(tab.key)}
              >
                <span>{tab.label}</span>
                <small className="text-xs">{tab.subtitle}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="control-group search-group">
          <div className="control-heading">
            <p className="eyebrow text-xs">Search</p>
            <h2>Symbol or company</h2>
          </div>
          <label className="field">
            <span className="text-xs">Ticker lookup</span>
            <input
              className="text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="MEBL, ENGRO, LUCK..."
            />
          </label>
        </div>

        <div className="control-group assumption-group">
          <div className="control-heading">
            <p className="eyebrow text-xs">Assumptions</p>
            <h2>Holding model</h2>
          </div>
          <div className="field-grid">
            <label className="field">
              <span className="text-xs">Investment / stock (Rs)</span>
              <input
                className="text-sm"
                inputMode="numeric"
                value={investmentAmount}
                onChange={(event) => setInvestmentAmount(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="text-xs">WHT (%)</span>
              <input
                className="text-sm"
                inputMode="decimal"
                value={withholdingTax}
                onChange={(event) => setWithholdingTax(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="text-xs">Zakat (%)</span>
              <input
                className="text-sm"
                inputMode="decimal"
                value={zakatRate}
                onChange={(event) => setZakatRate(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="text-xs">Face value (Rs)</span>
              <input
                className="text-sm"
                inputMode="decimal"
                value={faceValue}
                onChange={(event) => setFaceValue(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="table-panel market-surface">
        <div className="table-header">
          <div>
            <p className="eyebrow text-xs">Ranked constituents</p>
            <h2>Three-year dividend totals</h2>
          </div>
          <p className="methodology text-xs">
            PSX payout percentages are converted to rupees per share using a Rs{" "}
            {derived.configuredFaceValue.toFixed(2)} face value assumption. {activeTab.label} is
            ranked by net dividend yield after the configured deductions; current-year data is as of{" "}
            {derived.sourceAsOf || "the latest import"}.
          </p>
        </div>

        <div className="table-wrap">
          <table className="text-sm">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Latest price</th>
                {fiscalTabs.map((tab) => (
                  <th key={tab.key}>{tab.label} dividend &amp; net yield</th>
                ))}
                <th>{activeTab.label} interval</th>
                <th>Gross cash on holding</th>
                <th>Net cash after deductions</th>
              </tr>
            </thead>
            <tbody>
              {derived.rows.map((row) => (
                <tr key={row.symbol}>
                  <td>
                    <div className="stock-cell text-sm">
                      <a href={row.companyUrl} target="_blank" rel="noreferrer">
                        {row.symbol}
                      </a>
                      <div className="text-xs">
                        <strong>{row.name}</strong>
                        <span>Company year end: {row.fiscalYearEndLabel}</span>
                      </div>
                    </div>
                  </td>
                  <td>{formatCurrency(row.latestPrice)}</td>
                  {fiscalTabs.map((tab) => {
                    const summary = row.summaries[tab.key] ?? EMPTY_SUMMARY;
                    const faceValueScale =
                      configuredFaceValue /
                      (row.faceValueAssumption || 10);
                    const dividendPerShare =
                      summary.totalDividendPerShare * faceValueScale;
                    const yearNetYield =
                      row.latestPrice > 0
                        ? (dividendPerShare /
                            row.latestPrice) *
                          (1 - combinedDeduction) *
                          100
                        : 0;

                    return (
                      <td key={tab.key}>
                        <div className="metric-stack text-sm">
                          <div className="dividend-yield-line">
                            <strong>{formatCurrency(dividendPerShare)}</strong>
                            <span className="net-yield-label text-xs">
                              (NET YIELD:{" "}
                              <span className="net-yield-value">
                                {formatPercent(yearNetYield)}
                              </span>
                              )
                            </span>
                          </div>
                          <span className="text-xs">
                            {formatPercent(summary.totalDividendPercent)} ·{" "}
                            {summary.payoutCount || "No"}{" "}
                            {summary.payoutCount === 1 ? "payout" : "payouts"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td>{row.intervalLabel || "None"}</td>
                  <td>{formatCurrency(row.grossDividendCash, 0)}</td>
                  <td>{formatCurrency(row.netDividendCash, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
