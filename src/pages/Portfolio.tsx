import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import type { TradeRecord, AssetType } from "../types";
import {
  Wallet, PieChart as PieChartIcon, TrendingUp, Briefcase, Trash2, X,
  RefreshCw, DollarSign, ArrowRightLeft
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import clsx from "clsx";
import Swal from "sweetalert2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, ArcElement
);

/* ── Types ── */
interface AggregatedHolding {
  key: string;
  symbol: string;
  assetType: AssetType;
  currency: string;
  totalContracts: number;
  avgEntry: number;
  totalInvestedOriginal: number;
  trades: TradeRecord[];
}

/* ── Helpers ── */
function getDefaultCurrency(assetType?: AssetType): string {
  return assetType === "US_STOCK" ? "USD" : "THB";
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest/USD";

/* ════════════════════════════════════════════════════════════════ */

export default function Portfolio() {
  const { user } = useAuth();
  const [allTrades, setAllTrades] = useState<TradeRecord[]>([]);
  const [allOpenTrades, setAllOpenTrades] = useState<TradeRecord[]>([]);
  const [tfexRealized, setTfexRealized] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [assetFilter, setAssetFilter] = useState("all");
  const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({});

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

  useEffect(() => {
    fetchPortfolioData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`portfolio_prices_${user.uid}`);
      if (saved) {
        try { setCurrentPrices(JSON.parse(saved)); } catch { /* ignore */ }
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && Object.keys(currentPrices).length > 0) {
      localStorage.setItem(`portfolio_prices_${user.uid}`, JSON.stringify(currentPrices));
    }
  }, [currentPrices, user]);

  const fetchPortfolioData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const qAll = query(collection(db, "trades"), where("userId", "==", user.uid));
      const snapshotAll = await getDocs(qAll);
      const fetchedData = snapshotAll.docs.map(d => ({ id: d.id, ...d.data() })) as TradeRecord[];

      const invData = fetchedData.filter(t => t.assetType && t.assetType !== "TFEX");
      const tfexData = fetchedData.filter(t => !t.assetType || t.assetType === "TFEX");

      const realizedTfex = tfexData.filter(t => t.status !== "open").reduce((sum, t) => sum + (t.netPnl ?? 0), 0);
      setTfexRealized(realizedTfex);

      setAllTrades(invData.sort((a, b) => (b.date < a.date ? -1 : 1)));
      setAllOpenTrades(invData.filter(t => t.status === "open").sort((a, b) => (b.date < a.date ? -1 : 1)));
    } catch (error) {
      console.error("Error fetching portfolio data:", error);
    } finally {
      setLoading(false);
    }
  };

  const { trades, openTrades } = useMemo(() => {
    let closed = allTrades;
    let open = allOpenTrades;
    if (assetFilter !== "all") {
      closed = closed.filter(t => t.assetType === assetFilter);
      open = open.filter(t => t.assetType === assetFilter);
    }
    return { trades: closed, openTrades: open };
  }, [allTrades, allOpenTrades, assetFilter]);

  const holdings = useMemo((): AggregatedHolding[] => {
    const map = new Map<string, AggregatedHolding>();

    openTrades.forEach(trade => {
      const currency = trade.currency || getDefaultCurrency(trade.assetType);
      const key = `${trade.assetType}_${trade.symbol}_${currency}`;
      const existing = map.get(key);

      if (existing) {
        const totalCost = existing.avgEntry * existing.totalContracts + trade.entry * trade.contracts;
        const newTotal = existing.totalContracts + trade.contracts;
        existing.avgEntry = totalCost / newTotal;
        existing.totalContracts = newTotal;
        existing.totalInvestedOriginal = existing.avgEntry * existing.totalContracts;
        existing.trades.push(trade);
      } else {
        map.set(key, {
          key,
          symbol: trade.symbol,
          assetType: (trade.assetType || "TH_STOCK") as AssetType,
          currency,
          totalContracts: trade.contracts,
          avgEntry: trade.entry,
          totalInvestedOriginal: trade.entry * trade.contracts,
          trades: [trade],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalInvestedOriginal - a.totalInvestedOriginal);
  }, [openTrades]);

  const stats = useMemo(() => {
    const rate = usdThbRate || 0;

    let totalCurrentTHB = 0;
    let totalCurrentUSD = 0;
    let totalInvestedTHB = 0;
    let totalInvestedUSD = 0;
    let totalRealized = tfexRealized;
    const allocationMap: Record<string, number> = {};

    holdings.forEach(h => {
      const cp = parseFloat(currentPrices[h.key] || "");
      const curPrice = !isNaN(cp) && cp > 0 ? cp : h.avgEntry;
      const curValue = curPrice * h.totalContracts;
      const invValue = h.avgEntry * h.totalContracts;

      if (h.currency === "USD") {
        totalInvestedUSD += invValue;
        totalCurrentUSD += curValue;
      } else {
        totalInvestedTHB += invValue;
        totalCurrentTHB += curValue;
      }

      const valueTHB = h.currency === "USD" ? curValue * rate : curValue;
      const label = h.assetType?.replace('_', ' ') || 'Unknown';
      allocationMap[label] = (allocationMap[label] || 0) + valueTHB;
    });

    trades.filter(t => t.status !== "open").forEach(t => { totalRealized += (t.netPnl ?? 0); });

    const unrealizedTHB = totalCurrentTHB - totalInvestedTHB;
    const unrealizedUSD = totalCurrentUSD - totalInvestedUSD;
    const unrealizedCombinedTHB = unrealizedTHB + unrealizedUSD * rate;

    const totalPortfolioTHB = totalCurrentTHB + totalCurrentUSD * rate;
    const totalPortfolioUSD = rate > 0 ? totalCurrentTHB / rate + totalCurrentUSD : totalCurrentUSD;

    return {
      totalInvestedTHB, totalInvestedUSD,
      totalCurrentTHB, totalCurrentUSD,
      totalPortfolioTHB, totalPortfolioUSD,
      unrealizedTHB, unrealizedUSD, unrealizedCombinedTHB,
      totalRealized, allocationMap,
    };
  }, [holdings, currentPrices, trades, usdThbRate, tfexRealized]);

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: "ยืนยันการลบ",
      text: "คุณต้องการลบรายการนี้ใช่หรือไม่?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "ลบข้อมูล",
      cancelButtonText: "ยกเลิก"
    });
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "trades", id));
        setAllTrades(prev => prev.filter(t => t.id !== id));
        setAllOpenTrades(prev => prev.filter(t => t.id !== id));
        Swal.fire({ icon: "success", title: "ลบสำเร็จ", showConfirmButton: false, timer: 1500 });
      } catch (error) {
        console.error("Error deleting trade:", error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถลบข้อมูลได้", "error");
      }
    }
  };

  const handleClosePosition = async (holding: AggregatedHolding) => {
    const sym = holding.currency === "USD" ? "$" : "฿";

    const { value: formValues } = await Swal.fire({
      title: `ขาย / ปิดสถานะ ${holding.symbol}`,
      html: `
        <div style="text-align:left; margin-bottom:16px; font-size:0.85rem; color:#9aa0a6">
          ต้นทุนเฉลี่ย: <b>${sym}${fmt(holding.avgEntry)}</b>
          &nbsp;|&nbsp; ปริมาณรวม: <b>${fmt(holding.totalContracts, holding.totalContracts % 1 === 0 ? 0 : 4)}</b> หน่วย
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <input id="swal-exit" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" type="number" step="any" placeholder="ราคาขาย (Exit) *" autofocus>
          <input id="swal-comm" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" type="number" step="any" placeholder="ค่าธรรมเนียม ขาออก รวม (฿)" value="0">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "ยืนยันการขาย",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#00d4aa",
      cancelButtonColor: "#3f3f46",
      preConfirm: () => {
        const exit = parseFloat((document.getElementById("swal-exit") as HTMLInputElement).value);
        const commExit = parseFloat((document.getElementById("swal-comm") as HTMLInputElement).value) || 0;
        if (!exit || isNaN(exit)) {
          Swal.showValidationMessage("กรุณากรอกราคาขาย");
          return false;
        }
        return { exit, commExit };
      }
    });

    if (!formValues) return;

    const { exit, commExit } = formValues;
    let totalNetPnl = 0;

    try {
      for (const trade of holding.trades) {
        const portion = trade.contracts / holding.totalContracts;
        const commShare = Number((commExit * portion).toFixed(2));
        const pointDiff = exit - trade.entry;
        const pts = (trade.side === "Long" || trade.side === "Buy") ? pointDiff : -pointDiff;
        const exchangeRate = trade.exchangeRate || 1;
        const pnlBaht = pts * trade.contracts * exchangeRate;
        const commEntry = trade.commissionEntry ?? trade.commission ?? 0;
        const netPnl = pnlBaht - commEntry - commShare;
        totalNetPnl += netPnl;

        await updateDoc(doc(db, "trades", trade.id!), {
          exit,
          commissionExit: commShare,
          status: "closed",
          points: Number(pts.toFixed(4)),
          pnlBaht: Number(pnlBaht.toFixed(2)),
          netPnl: Number(netPnl.toFixed(2))
        });
      }

      Swal.fire({
        icon: totalNetPnl >= 0 ? "success" : "info",
        title: "ขายสำเร็จ",
        text: `Net P&L รวม: ${totalNetPnl >= 0 ? "+" : ""}฿${totalNetPnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        timer: 2000,
        showConfirmButton: false
      });

      await fetchPortfolioData();
    } catch (error) {
      console.error("Error closing position:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกการขายได้", "error");
    }
  };

  /* ── Chart ── */
  const allocLabels = Object.keys(stats.allocationMap).sort((a, b) => stats.allocationMap[b] - stats.allocationMap[a]);
  const allocChartData = {
    labels: allocLabels,
    datasets: [{
      data: allocLabels.map(a => stats.allocationMap[a]),
      backgroundColor: ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doughnutOpts: any = {
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            let l = ctx.label || '';
            if (l) l += ': ';
            if (ctx.parsed !== null) l += '฿' + ctx.parsed.toLocaleString('en-US', { maximumFractionDigits: 0 });
            return l;
          }
        }
      }
    }
  };

  const badgeColor = (asset: string) => {
    switch (asset) {
      case 'TH_STOCK': return "bg-blue-500/10 text-blue-400 border-blue-500/15";
      case 'US_STOCK': return "bg-purple-500/10 text-purple-400 border-purple-500/15";
      case 'FUND': return "bg-pink-500/10 text-pink-400 border-pink-500/15";
      case 'CRYPTO': return "bg-amber-500/10 text-amber-400 border-amber-500/15";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/15";
    }
  };
  const badgeLabel = (asset: string) => {
    switch (asset) {
      case 'TH_STOCK': return "หุ้นไทย";
      case 'US_STOCK': return "หุ้น US";
      case 'FUND': return "กองทุน";
      case 'CRYPTO': return "Crypto";
      default: return asset;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 text-brand-start">
          <div className="w-10 h-10 border-[3px] border-brand-start/30 border-t-brand-start rounded-full animate-spin" />
          <span className="text-sm font-medium text-textMuted animate-pulse">กำลังโหลดข้อมูล...</span>
        </div>
      </div>
    );
  }

  const rate = usdThbRate || 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-brand-start" />
            Portfolio
          </h2>
          <p className="text-textMuted text-sm mt-1">สรุปการถือครอง, ต้นทุนเฉลี่ย และมูลค่าปัจจุบัน</p>
        </div>
        <select
          className="w-full sm:w-auto !py-2 text-sm"
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.target.value)}
        >
          <option value="all">ทุกสินทรัพย์</option>
          <option value="TH_STOCK">หุ้นไทย</option>
          <option value="US_STOCK">หุ้นอเมริกา</option>
          <option value="FUND">กองทุนรวม</option>
          <option value="CRYPTO">คริปโต</option>
        </select>
      </div>

      {/* ── Exchange Rate ── */}
      <div className="card !p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 !border-purple-500/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.1)' }}>
            <ArrowRightLeft className="w-[18px] h-[18px] text-purple-400" />
          </div>
          <div>
            <div className="text-[11px] text-textMuted/60 font-medium uppercase tracking-wider">USD/THB</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-purple-400">{rate > 0 ? fmt(rate, 4) : "—"}</span>
              <span className="text-xs text-textMuted/40">฿/$</span>
            </div>
            {rateLastUpdated && (
              <div className="text-[10px] text-textMuted/30 mt-0.5">{rateLastUpdated.toLocaleTimeString('th-TH')}</div>
            )}
          </div>
        </div>
        <button onClick={fetchExchangeRate} disabled={rateLoading} className="btn btn-secondary !py-1.5 !px-3 text-xs">
          <RefreshCw className={clsx("w-3.5 h-3.5", rateLoading && "animate-spin")} />
          {rateLoading ? "โหลด..." : "รีเฟรช"}
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="มูลค่ารวม (THB)" value={`฿${fmt(stats.totalPortfolioTHB)}`} subtitle={stats.totalCurrentTHB > 0 ? `สินทรัพย์ THB: ฿${fmt(stats.totalCurrentTHB)}` : undefined} icon={Wallet} iconColor="#60a5fa" iconBg="rgba(96,165,250,0.1)" />
        <StatCard title="มูลค่ารวม (USD)" value={`$${fmt(stats.totalPortfolioUSD)}`} subtitle={stats.totalCurrentUSD > 0 ? `สินทรัพย์ USD: $${fmt(stats.totalCurrentUSD)}` : undefined} icon={DollarSign} iconColor="#a78bfa" iconBg="rgba(167,139,250,0.1)" />
        <StatCard title="Unrealized P&L" value={`฿${stats.unrealizedCombinedTHB >= 0 ? '+' : ''}${fmt(stats.unrealizedCombinedTHB)}`} subtitle={stats.unrealizedUSD !== 0 ? `USD: $${stats.unrealizedUSD >= 0 ? '+' : ''}${fmt(stats.unrealizedUSD)}` : undefined} icon={TrendingUp} iconColor={stats.unrealizedCombinedTHB >= 0 ? "#34d399" : "#fb7185"} iconBg={stats.unrealizedCombinedTHB >= 0 ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)"} />
        <StatCard title="Realized P&L" value={`฿${stats.totalRealized >= 0 ? '+' : ''}${fmt(stats.totalRealized)}`} subtitle={`TFEX: ฿${tfexRealized >= 0 ? '+' : ''}${fmt(tfexRealized)}`} icon={Briefcase} iconColor={stats.totalRealized >= 0 ? "#34d399" : "#fb7185"} iconBg={stats.totalRealized >= 0 ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)"} />
      </div>

      {/* ── Holdings + Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-start" />
            Holdings
            {holdings.length > 0 && <span className="text-[11px] text-textMuted/50 font-normal">({holdings.length} สินทรัพย์)</span>}
          </h3>

          {holdings.length === 0 ? (
            <div className="text-center py-16 text-textMuted/40 text-sm">ไม่มีสินทรัพย์ที่ถือครอง</div>
          ) : (
            <div className="space-y-2.5">
              {['TH_STOCK', 'US_STOCK', 'FUND', 'CRYPTO'].map(assetType => {
                const catHoldings = holdings.filter(h => h.assetType === assetType);
                if (catHoldings.length === 0) return null;
                return (
                  <AssetCategoryCard
                    key={assetType}
                    assetType={assetType}
                    holdings={catHoldings}
                    currentPrices={currentPrices}
                    setCurrentPrices={setCurrentPrices}
                    rate={rate}
                    badgeColor={badgeColor}
                    badgeLabel={badgeLabel}
                    onSell={handleClosePosition}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-brand-start" />
            <h3 className="text-sm font-semibold">สัดส่วนพอร์ต</h3>
          </div>
          <div className="h-56 w-full flex items-center justify-center">
            {allocLabels.length > 0 ? (
              <Doughnut data={allocChartData} options={doughnutOpts} />
            ) : (
              <div className="text-textMuted/30 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>

          {(stats.totalCurrentTHB > 0 || stats.totalCurrentUSD > 0) && (
            <div className="space-y-2 pt-3 border-t border-white/[0.04]">
              <div className="text-[10px] font-semibold text-textMuted/40 uppercase tracking-widest px-1">แยกตามสกุลเงิน</div>
              {stats.totalCurrentTHB > 0 && (
                <div className="flex justify-between text-xs px-1">
                  <span className="text-blue-400">THB</span>
                  <span className="font-mono">฿{fmt(stats.totalCurrentTHB)}</span>
                </div>
              )}
              {stats.totalCurrentUSD > 0 && (
                <div className="flex justify-between text-xs px-1">
                  <span className="text-purple-400">USD</span>
                  <span className="font-mono">${fmt(stats.totalCurrentUSD)}</span>
                </div>
              )}
              {stats.totalCurrentUSD > 0 && rate > 0 && (
                <div className="flex justify-between text-[11px] text-textMuted/30 px-1">
                  <span>USD → THB</span>
                  <span className="font-mono">≈ ฿{fmt(stats.totalCurrentUSD * rate)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      <div className="card !p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-white/[0.06]">
          <h3 className="font-semibold text-sm">Transactions History</h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ประเภท</th>
                <th>สินทรัพย์</th>
                <th>Side</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Exit</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Currency</th>
                <th className="text-right">Net P&L (฿)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-textMuted/40 text-sm">ยังไม่มีข้อมูล</td></tr>
              ) : (
                trades.map((trade) => {
                  const cur = trade.currency || getDefaultCurrency(trade.assetType);
                  return (
                    <tr key={trade.id}>
                      <td className="font-mono text-xs text-textMuted/60 whitespace-nowrap">{trade.date}</td>
                      <td>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${badgeColor(trade.assetType!)}`}>
                          {badgeLabel(trade.assetType!)}
                        </span>
                      </td>
                      <td className="font-bold text-sm">{trade.symbol}</td>
                      <td>
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold",
                          (trade.side === "Buy") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>{trade.side}</span>
                      </td>
                      <td className="text-right font-mono text-xs">{trade.entry}</td>
                      <td className="text-right font-mono text-xs">
                        {trade.status === "open" ? (
                          <span className="text-[10px] font-semibold bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">OPEN</span>
                        ) : (trade.exit ?? "—")}
                      </td>
                      <td className="text-right text-textMuted/60 text-xs">{trade.contracts}</td>
                      <td className="text-right">
                        <span className={clsx("text-[10px] font-mono px-1 py-0.5 rounded", cur === "USD" ? "bg-purple-500/8 text-purple-400" : "bg-blue-500/8 text-blue-400")}>{cur}</span>
                      </td>
                      <td className={clsx(
                        "text-right font-mono font-semibold text-xs",
                        trade.status === "open" ? "text-textMuted/40" : (trade.netPnl ?? 0) > 0 ? "text-emerald-400" : (trade.netPnl ?? 0) < 0 ? "text-rose-400" : "text-textMuted/40"
                      )}>
                        {trade.status === "open" ? "—" : `${(trade.netPnl ?? 0) > 0 ? '+' : ''}${(trade.netPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      </td>
                      <td className="text-right">
                        <button onClick={() => handleDelete(trade.id!)} className="p-1.5 text-textMuted/30 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="ลบ">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════  SUB-COMPONENTS  ════════════════════ */

function AssetCategoryCard({
  assetType, holdings, currentPrices, setCurrentPrices, rate,
  badgeColor, badgeLabel, onSell
}: {
  assetType: string;
  holdings: AggregatedHolding[];
  currentPrices: Record<string, string>;
  setCurrentPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rate: number;
  badgeColor: (a: string) => string;
  badgeLabel: (a: string) => string;
  onSell: (holding: AggregatedHolding) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  let totalCostTHB = 0;
  let totalValueTHB = 0;

  holdings.forEach(h => {
    const cp = parseFloat(currentPrices[h.key] || "");
    const curPrice = !isNaN(cp) && cp > 0 ? cp : h.avgEntry;
    const curValue = curPrice * h.totalContracts;
    const invValue = h.avgEntry * h.totalContracts;

    const valueTHB = h.currency === "USD" ? curValue * rate : curValue;
    const costTHB = h.currency === "USD" ? invValue * rate : invValue;

    totalCostTHB += costTHB;
    totalValueTHB += valueTHB;
  });

  const unrealizedTHB = totalValueTHB - totalCostTHB;
  const unrealizedPct = totalCostTHB > 0 ? (unrealizedTHB / totalCostTHB) * 100 : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.015] overflow-hidden transition-all duration-200">
      <div
        className={clsx(
          "flex items-center justify-between p-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors",
          isExpanded && "border-b border-gray-100 dark:border-white/[0.04]"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor(assetType)}`}>
            {badgeLabel(assetType)}
          </span>
          <span className="text-xs text-textMuted/50">{holdings.length} รายการ</span>
        </div>

        <div className="text-right flex items-center gap-4">
          <div className="hidden sm:block">
            <div className="text-[10px] text-textMuted/40">Value</div>
            <div className="font-mono font-bold text-xs">฿{fmt(totalValueTHB)}</div>
          </div>
          <div className="min-w-[80px]">
            <div className="text-[10px] text-textMuted/40">P&L</div>
            <div className={clsx("font-mono font-bold text-xs", unrealizedTHB > 0 ? "text-emerald-400" : unrealizedTHB < 0 ? "text-rose-400" : "text-textMuted/40")}>
              {unrealizedTHB >= 0 ? "+" : "-"}฿{fmt(Math.abs(unrealizedTHB))}
            </div>
            <div className={clsx("text-[10px] font-mono", unrealizedPct > 0 ? "text-emerald-400/60" : unrealizedPct < 0 ? "text-rose-400/60" : "text-textMuted/30")}>
              ({unrealizedPct >= 0 ? "+" : ""}{unrealizedPct.toFixed(2)}%)
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 bg-gray-50/30 dark:bg-black/10 grid grid-cols-1 xl:grid-cols-2 gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
          {holdings.map(h => (
            <HoldingCard key={h.key} holding={h} currentPrices={currentPrices} setCurrentPrices={setCurrentPrices} rate={rate} badgeColor={badgeColor} badgeLabel={badgeLabel} onSell={onSell} />
          ))}
        </div>
      )}
    </div>
  );
}

function HoldingCard({
  holding: h, currentPrices, setCurrentPrices, rate,
  badgeColor, badgeLabel, onSell,
}: {
  holding: AggregatedHolding;
  currentPrices: Record<string, string>;
  setCurrentPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rate: number;
  badgeColor: (a: string) => string;
  badgeLabel: (a: string) => string;
  onSell: (holding: AggregatedHolding) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cp = parseFloat(currentPrices[h.key] || "");
  const hasPrice = !isNaN(cp) && cp > 0;
  const curPrice = hasPrice ? cp : null;

  let unrealizedPnl: number | null = null;
  let unrealizedPct: number | null = null;
  let currentValue: number | null = null;

  if (curPrice !== null) {
    const diff = curPrice - h.avgEntry;
    unrealizedPnl = diff * h.totalContracts;
    unrealizedPct = (diff / h.avgEntry) * 100;
    currentValue = curPrice * h.totalContracts;
  }

  const sym = h.currency === "USD" ? "$" : "฿";

  return (
    <div
      className={clsx(
        "rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3.5 transition-all duration-200",
        !isExpanded && "cursor-pointer hover:border-brand-start/30 hover:shadow-glow-sm",
        isExpanded && "space-y-3"
      )}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      <div className={clsx("flex items-center gap-2 flex-wrap relative", isExpanded && "pb-2 border-b border-white/[0.04]")}>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor(h.assetType)}`}>
          {badgeLabel(h.assetType)}
        </span>
        <span className="font-bold">{h.symbol}</span>

        {!isExpanded && (
          <div className="ml-auto text-right">
            <div className="text-sm font-bold font-mono">
              {sym}{fmt(currentValue !== null ? currentValue : h.totalInvestedOriginal)}
            </div>
            {unrealizedPnl !== null ? (
              <div className={clsx("text-[10px] font-mono", unrealizedPnl > 0 ? "text-emerald-400" : unrealizedPnl < 0 ? "text-rose-400" : "text-textMuted/40")}>
                {unrealizedPnl >= 0 ? "+" : "-"}{sym}{fmt(Math.abs(unrealizedPnl))} ({unrealizedPct! >= 0 ? "+" : ""}{unrealizedPct!.toFixed(2)}%)
              </div>
            ) : (
              <div className="text-[10px] font-mono text-textMuted/40">{h.totalContracts} @ {sym}{fmt(h.avgEntry)}</div>
            )}
          </div>
        )}

        {isExpanded && (
          <>
            <span className="ml-auto mr-6 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-textMuted/40">{h.currency}</span>
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-textMuted/30 hover:text-white bg-white/[0.06] rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div>
              <span className="text-textMuted/40 text-[11px]">ต้นทุนเฉลี่ย</span>
              <div className="font-mono font-semibold text-sm">{sym}{fmt(h.avgEntry)}</div>
            </div>
            <div>
              <span className="text-textMuted/40 text-[11px]">จำนวน</span>
              <div className="font-mono font-semibold text-sm">{fmt(h.totalContracts, h.totalContracts % 1 === 0 ? 0 : 4)}</div>
            </div>
            <div>
              <span className="text-textMuted/40 text-[11px]">มูลค่าต้นทุน</span>
              <div className="font-mono text-xs">{sym}{fmt(h.totalInvestedOriginal)}</div>
            </div>
            {currentValue !== null && (
              <div>
                <span className="text-textMuted/40 text-[11px]">มูลค่าปัจจุบัน</span>
                <div className="font-mono text-xs">{sym}{fmt(currentValue)}</div>
              </div>
            )}
          </div>

          {h.trades.length > 1 && (
            <div className="text-[10px] text-textMuted/30 bg-white/[0.02] px-2 py-1 rounded">
              รวมจาก {h.trades.length} รายการ (เฉลี่ยต้นทุนแล้ว)
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-textMuted/30 font-mono">{sym}</span>
              <input
                type="number"
                step="any"
                placeholder="ราคาปัจจุบัน..."
                className="w-full !py-1.5 !pl-6 text-xs rounded-lg !pr-7 !bg-white/[0.03] font-mono"
                value={currentPrices[h.key] || ""}
                onChange={e => setCurrentPrices(prev => ({ ...prev, [h.key]: e.target.value }))}
              />
              {currentPrices[h.key] && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-textMuted/30 hover:text-white rounded-full"
                  onClick={(e) => { e.stopPropagation(); setCurrentPrices(prev => { const n = { ...prev }; delete n[h.key]; return n; })}}
                ><X className="w-3 h-3" /></button>
              )}
            </div>
            <div className="text-right min-w-[80px]">
              {unrealizedPnl !== null ? (
                <div>
                  <div className={clsx("text-sm font-mono font-bold", unrealizedPnl > 0 ? "text-emerald-400" : unrealizedPnl < 0 ? "text-rose-400" : "text-textMuted/40")}>
                    {unrealizedPnl >= 0 ? "+" : "-"}{sym}{fmt(Math.abs(unrealizedPnl))}
                  </div>
                  <div className={clsx("text-[10px] font-mono", unrealizedPct! > 0 ? "text-emerald-400/60" : unrealizedPct! < 0 ? "text-rose-400/60" : "text-textMuted/30")}>
                    ({unrealizedPct! >= 0 ? "+" : ""}{unrealizedPct!.toFixed(2)}%)
                  </div>
                </div>
              ) : (
                <span className="text-textMuted/30 font-mono text-sm">—</span>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.04]">
            <button onClick={() => onSell(h)} className="w-full btn btn-outline !py-2 text-xs">
              ขาย / ปิดสถานะ
            </button>
          </div>

          {h.currency === "USD" && rate > 0 && (
            <div className="text-[10px] text-purple-400/60 bg-purple-500/[0.04] border border-purple-500/10 px-2 py-1.5 rounded flex items-center justify-between">
              <span>≈ เป็นบาท</span>
              <span className="font-mono font-semibold">฿{fmt((currentValue ?? h.totalInvestedOriginal) * rate)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, iconColor, iconBg }: {
  title: string; value: string; subtitle?: string; icon: React.ElementType; iconColor: string; iconBg: string;
}) {
  return (
    <div className="card !p-4 group hover:!border-white/[0.12] transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-textMuted/70 uppercase tracking-wider truncate">{title}</div>
          <div className="text-lg font-bold font-mono tracking-tight mt-0.5 truncate">{value}</div>
          {subtitle && <div className="text-[10px] text-textMuted/40 font-mono mt-0.5 truncate">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
