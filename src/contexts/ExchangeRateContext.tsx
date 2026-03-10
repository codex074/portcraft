import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest/USD";

interface ExchangeRateContextType {
  usdThbRate: number | null;
  rateLoading: boolean;
  rateLastUpdated: Date | null;
  fetchExchangeRate: () => Promise<void>;
}

const ExchangeRateContext = createContext<ExchangeRateContextType | null>(null);

export function ExchangeRateProvider({ children }: { children: ReactNode }) {
  const [usdThbRate, setUsdThbRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateLastUpdated, setRateLastUpdated] = useState<Date | null>(null);

  const fetchExchangeRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch(EXCHANGE_RATE_API);
      const data = await res.json();
      const thbRate = data.rates?.THB;
      if (thbRate) {
        setUsdThbRate(thbRate);
        setRateLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
    } finally {
      setRateLoading(false);
    }
  }, []);

  useEffect(() => { fetchExchangeRate(); }, [fetchExchangeRate]);

  return (
    <ExchangeRateContext.Provider value={{ usdThbRate, rateLoading, rateLastUpdated, fetchExchangeRate }}>
      {children}
    </ExchangeRateContext.Provider>
  );
}

export function useExchangeRate() {
  const ctx = useContext(ExchangeRateContext);
  if (!ctx) throw new Error("useExchangeRate must be used within ExchangeRateProvider");
  return ctx;
}
