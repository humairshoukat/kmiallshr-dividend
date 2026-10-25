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
  faceValue: number;
  faceValueSourceUrl: string;
  faceValueSourceAsOf: string;
  faceValueSourcePage: number;
  dividendPerShareBasis: "current-face-value";
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
        faceValue,
        faceValueSourceUrl,
        faceValueSourceAsOf,
        faceValueSourcePage,
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
        faceValue,
        faceValueSourceUrl,
        faceValueSourceAsOf,
        faceValueSourcePage,
        fiscalYears,
        currentFiscalYear,
        dividendPerShareBasis: "current-face-value" as const,
        summary: summary as Record<FiscalYearKey, FiscalYearSummary>,
      }),
    )
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
