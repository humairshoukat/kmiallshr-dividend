"use client";

import { useState } from "react";
import type { Stock } from "@/lib/stocks";
import { Icon } from "./ui-icon";
import { SnapshotMeta } from "./snapshot-meta";
import { FaceValueBadge } from "./face-value-badge";

type PriceHikeDashboardProps = {
  stocks: Stock[];
};

const sortOptions = {
  "price-desc": { label: "Price: high to low", description: "Sorted by latest share price, highest first.", compare: (a: Stock, b: Stock) => b.latestPrice - a.latestPrice },
  "price-asc": { label: "Price: low to high", description: "Sorted by latest share price, lowest first.", compare: (a: Stock, b: Stock) => a.latestPrice - b.latestPrice },
  "symbol-asc": { label: "Symbol: A–Z", description: "Sorted by stock symbol, A–Z.", compare: (a: Stock, b: Stock) => a.symbol.localeCompare(b.symbol) },
  "symbol-desc": { label: "Symbol: Z–A", description: "Sorted by stock symbol, Z–A.", compare: (a: Stock, b: Stock) => b.symbol.localeCompare(a.symbol) },
  "name-asc": { label: "Company: A–Z", description: "Sorted by company name, A–Z.", compare: (a: Stock, b: Stock) => a.name.localeCompare(b.name) },
  "name-desc": { label: "Company: Z–A", description: "Sorted by company name, Z–A.", compare: (a: Stock, b: Stock) => b.name.localeCompare(a.name) },
};

type SortOrder = keyof typeof sortOptions;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function PriceHikeDashboard({ stocks }: PriceHikeDashboardProps) {
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("price-desc");
  const sourceAsOf = stocks[0]?.sourceAsOf ?? "";
  const query = search.trim().toLowerCase();
  const selectedSort = sortOptions[sortOrder];
  const rows = stocks
    .filter((stock) => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query))
    .sort((a, b) => selectedSort.compare(a, b) || a.symbol.localeCompare(b.symbol));

  return (
    <main className="shell price-shell">
      <header className="market-header">
        <div className="market-title">
          <p className="eyebrow">Markets <span>/</span> KMIALLSHR</p>
          <h1>Price snapshot<span className="heading-dot">.</span></h1>
          <p className="lede">The latest prices across the index, all in one place.</p>
        </div>

        <SnapshotMeta date={sourceAsOf} />
      </header>

      <div className="control-band price-controls">
        <div className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search symbol or company"
            placeholder="Search symbol or company…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && <button type="button" className="clear-search" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
        </div>
        <label className="sort-field">
          <span>Sort by</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            {Object.entries(sortOptions).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
          </select>
          <Icon name="chevron" />
        </label>
      </div>

      <section className="table-panel market-surface">
        <div className="table-header">
          <div>
            <h2>Index constituents <span className="count-badge">{rows.length}</span></h2>
            <p>{selectedSort.description}</p>
          </div>
          <span className="table-context"><span className="status-dot" />KMIALLSHR</span>
        </div>

        <div className="table-wrap" tabIndex={0} role="region" aria-label="Constituent prices, scroll horizontally for more columns">
          <table className="price-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Latest price <span className="column-subtitle">Per share · PKR</span></th>
                <th scope="col">Snapshot date</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty-state">
                    <Icon name="search" />
                    <h3>No companies found</h3>
                    <p>Try another company name or stock symbol.</p>
                    <button type="button" onClick={() => setSearch("")}>Clear search</button>
                  </td>
                </tr>
              )}
              {rows.map((stock, index) => (
                <tr key={stock.symbol}>
                  <td>
                    <div className="company-cell"><span className="row-rank">{String(index + 1).padStart(2, "0")}</span><div className="stock-cell">
                      <div className="stock-heading"><a
                        href={stock.companyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {stock.symbol}<Icon name="arrow" />
                      </a><FaceValueBadge stock={stock} /></div>
                      <span className="company-name">{stock.name}</span>
                    </div></div>
                  </td>
                  <td><span>{formatCurrency(stock.latestPrice)}</span><span className="mobile-price-date">{stock.sourceAsOf}</span></td>
                  <td>{stock.sourceAsOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span role="status">Showing {rows.length} of {stocks.length} constituents</span><span>All amounts in PKR</span></div>
      </section>
      <footer className="page-footer"><p>Prices reflect the latest imported snapshot. Price changes require historical data.</p><a href={stocks[0]?.indexUrl} target="_blank" rel="noreferrer">Source: Pakistan Stock Exchange<Icon name="arrow" /></a></footer>
    </main>
  );
}
