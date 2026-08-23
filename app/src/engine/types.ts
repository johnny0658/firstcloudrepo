export interface PriceSeries {
  ticker: string;
  dates: string[]; // ISO YYYY-MM-DD, ascending
  adjClose: number[];
}

export interface FactorTable {
  columns: string[];
  months?: string[]; // YYYY-MM for monthly tables
  dates?: string[]; // YYYY-MM-DD for daily tables
  values: number[][]; // percent, as published by Ken French
}

export interface TickerInfo {
  symbol: string;
  name: string;
  type: "stock" | "equity_etf" | "bond_etf" | "commodity_etf";
  duration?: number; // years; bond ETFs only
}

export interface Holding {
  symbol: string;
  shares: number;
}

export interface Portfolio {
  holdings: Holding[];
  cash: number;
}

export interface ReturnSeries {
  labels: string[]; // dates or months
  returns: number[]; // decimal (0.01 = 1%)
}

/** Monthly factor observations in decimal, aligned across FF3 + MOM. */
export interface FactorMatrix {
  months: string[];
  mktRF: number[];
  smb: number[];
  hml: number[];
  mom: number[];
  rf: number[];
}

export interface FactorBetas {
  alpha: number; // monthly decimal
  mktRF: number;
  smb: number;
  hml: number;
  mom: number;
}

export interface RegressionResult {
  betas: FactorBetas;
  tStats: FactorBetas;
  r2: number;
  adjR2: number;
  residualStd: number; // monthly decimal
  nObs: number;
}
