import type { Stock } from "@/lib/stocks";
import { Icon } from "./ui-icon";
import { SnapshotMeta } from "./snapshot-meta";
import { FaceValueBadge } from "./face-value-badge";

type PriceHikeDashboardProps = {
  stocks: Stock[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function PriceHikeDashboard({ stocks }: PriceHikeDashboardProps) {
  const sourceAsOf = stocks[0]?.sourceAsOf ?? "";
  const rows = [...stocks].sort((a, b) => b.latestPrice - a.latestPrice);

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

      <section className="table-panel market-surface">
        <div className="table-header">
          <div>
            <h2>Index constituents <span className="count-badge">{stocks.length}</span></h2>
            <p>Sorted by latest share price, highest first.</p>
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
        <div className="table-footer"><span>{stocks.length} constituents</span><span>All amounts in PKR</span></div>
      </section>
      <footer className="page-footer"><p>Prices reflect the latest imported snapshot. Price changes require historical data.</p><a href={stocks[0]?.indexUrl} target="_blank" rel="noreferrer">Source: Pakistan Stock Exchange<Icon name="arrow" /></a></footer>
    </main>
  );
}
