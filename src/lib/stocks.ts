import stockData from "../../data/stocks.json";

export type FiscalYearKey = `fy${string}`;

export type FiscalYearSummary = {
  payoutCount: number;
  intervalLabel: string;
  totalDividendPercent: number;
  totalDividendPerShare: number;
};

export type Stock = {
  symbol: string;
  name: string;
  latestPrice: number;
  fiscalYearEndLabel: string;
  sourceAsOf: string;
  companyUrl: string;
  indexUrl: string;
  faceValueAssumption: number;
  fiscalYears: number[];
  currentFiscalYear: number;
  summary: Record<FiscalYearKey, FiscalYearSummary>;
};

export function getStocks(): Stock[] {
  return stockData
    .map(
      ({
        symbol,
        name,
        latestPrice,
        fiscalYearEndLabel,
        sourceAsOf,
        companyUrl,
        indexUrl,
        faceValueAssumption,
        fiscalYears,
        currentFiscalYear,
        summary,
      }) => ({
        symbol,
        name,
        latestPrice,
        fiscalYearEndLabel,
        sourceAsOf,
        companyUrl,
        indexUrl,
        faceValueAssumption,
        fiscalYears,
        currentFiscalYear,
        summary: summary as Record<FiscalYearKey, FiscalYearSummary>,
      }),
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
