export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  market_value: number;
  cost_basis?: number;
  unrealized_gain_loss?: number;
  unrealized_gain_loss_pct?: number;
  acquisition_date?: string;
  estimated_annual_income?: number;
  est_yield?: number;
  asset_class?: string;
  sector?: string;
  asset_type?: string;
  is_margin?: boolean;
  is_short?: boolean;
  confidence?: number;
  provenance?: Record<string, unknown>;
}

export interface AccountSummary {
  beginning_value?: number;
  ending_value: number;
  change_in_value?: number;
  cash_balance?: number;
  equities_value?: number;
  total_change?: number;
  net_deposits_withdrawals?: number;
  investment_gain_loss?: number;
}

export interface PortfolioData {
  account_info?: {
    account_number?: string;
    brokerage_name?: string;
    institution_name?: string;
    statement_period?: string;
    statement_period_start?: string;
    statement_period_end?: string;
    account_holder?: string;
    account_type?: string;
  };
  account_summary?: AccountSummary;
  holdings?: Holding[];
  detailed_holdings?: Holding[];
  transactions?: Array<Record<string, unknown>>;
  activity_and_transactions?: Array<Record<string, unknown>>;
  asset_allocation?:
    | {
        cash_percent?: number;
        cash_pct?: number;
        equities_percent?: number;
        equities_pct?: number;
        bonds_percent?: number;
        bonds_pct?: number;
        other_percent?: number;
      }
    | Array<{ category: string; market_value: number; percentage: number }>;
  income_summary?: {
    dividends_taxable?: number;
    interest_income?: number;
    total_income?: number;
    dividends?: number;
    interest?: number;
    total?: number;
  };
  realized_gain_loss?: {
    short_term?: number;
    short_term_gain?: number;
    short_term_loss?: number;
    long_term?: number;
    long_term_gain?: number;
    long_term_loss?: number;
    total?: number;
    net_realized?: number;
    net_short_term?: number;
    net_long_term?: number;
  };
  historical_values?: Array<Record<string, unknown>>;
  cash_flow?: Record<string, unknown>;
  cash_management?: Record<string, unknown>;
  cash_balance?: number;
  total_value?: number;
  ytd_metrics?: Record<string, unknown>;
  ytd_summary?: Record<string, unknown>;
  total_fees?: number;
  projections_and_mrd?: Record<string, unknown>;
  legal_and_disclosures?: string[];
  quality_report?: {
    raw?: number;
    validated?: number;
    aggregated?: number;
    dropped?: number;
    reconciled?: number;
    mismatch_detected?: number;
    dropped_reasons?: Record<string, number>;
    average_confidence?: number;
  };
}
