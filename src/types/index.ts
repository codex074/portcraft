export interface TradeRecord {
  id?: string;
  userId: string;
  date: string;           // YYYY-MM-DD
  symbol: string;
  series?: string;        // TFEX series e.g. M26, H26
  side: "Long" | "Short";
  entry: number;
  exit?: number;          // undefined = open position
  contracts: number;
  commissionEntry: number;  // Commission paid on open
  commissionExit: number;   // Commission paid on close (0 for open positions)
  commission?: number;      // Legacy: old records stored total commission here
  strategy?: string;
  notes?: string;
  status: "open" | "closed";
  points?: number;        // undefined for open positions
  netPnl?: number;        // undefined for open positions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
}

export interface UserSettings {
  userId: string;
  multipliers: {
    S50: number;
    GF: number;
    GFM: number;
    SIF: number;
    DW: number;
    Other: number;
    [key: string]: number;
  };
}
