import type { Stock } from "@/lib/stocks";

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
    <div className="shell">
      <header className="market-header">
        <div className="market-title">
          <p className="eyebrow text-xs">PSX · KMIALLSHR</p>
          <h1>Latest Price Snapshot</h1>
          <p className="lede text-sm">
            The local dataset contains the latest imported price for each stock.
            Historical price hikes need at least two dated prices per stock and
            cannot be calculated from this snapshot alone.
          </p>
        </div>

        <div className="market-meta">
          <div>
            <span className="stat-label">Snapshot</span>
            <strong>{sourceAsOf || "N/A"}</strong>
          </div>
          <div>
            <span className="stat-label">Stocks</span>
            <strong>{stocks.length}</strong>
          </div>
        </div>
      </header>

      <section className="table-panel market-surface">
        <div className="table-header">
          <div>
            <p className="eyebrow text-xs">Available local data</p>
            <h2>Current prices</h2>
          </div>
          <p className="methodology text-xs">
            Add dated price history to the generated JSON before restoring
            low-to-peak hike calculations.
          </p>
        </div>

        <div className="table-wrap">
          <table className="text-sm">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Latest price</th>
                <th>Snapshot date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stock) => (
                <tr key={stock.symbol}>
                  <td>
                    <div className="stock-cell text-sm">
                      <a
                        href={stock.companyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {stock.symbol}
                      </a>
                      <div className="text-xs">
                        <strong>{stock.name}</strong>
                      </div>
                    </div>
                  </td>
                  <td>{formatCurrency(stock.latestPrice)}</td>
                  <td>{stock.sourceAsOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
