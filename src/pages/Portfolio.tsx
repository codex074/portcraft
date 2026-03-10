import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useExchangeRate } from "../contexts/ExchangeRateContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import type { TradeRecord, AssetType } from "../types";
import {
  Wallet, PieChart as PieChartIcon, TrendingUp, Briefcase, Trash2, X,
  DollarSign, ArrowRightLeft, Pencil
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

/* ════════════════════════════════════════════════════════════════ */

export default function Portfolio() {
  const { user } = useAuth();
  const [allTrades, setAllTrades] = useState<TradeRecord[]>([]);
  const [allOpenTrades, setAllOpenTrades] = useState<TradeRecord[]>([]);
  const [tfexRealized, setTfexRealized] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [assetFilter, setAssetFilter] = useState("all");
  const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({});
  const [sellTarget, setSellTarget] = useState<AggregatedHolding | null>(null);
  const [activeDetail, setActiveDetail] = useState<"thb" | "usd" | "unrealized" | "realized" | null>(null);

  const { usdThbRate } = useExchangeRate();

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

  const handleClosePosition = (holding: AggregatedHolding) => {
    setSellTarget(holding);
  };

  const handleSellConfirm = async (exit: number, commExit: number) => {
    if (!sellTarget) return;
    let totalNetPnl = 0;
    try {
      for (const trade of sellTarget.trades) {
        const portion = trade.contracts / sellTarget.totalContracts;
        const commShare = Number((commExit * portion).toFixed(2));
        const pointDiff = exit - trade.entry;
        const pts = (trade.side === "Long" || trade.side === "Buy") ? pointDiff : -pointDiff;
        const exchangeRate = trade.exchangeRate || 1;
        const pnlBaht = pts * trade.contracts * exchangeRate;
        const commEntryNative = trade.commissionEntry ?? trade.commission ?? 0;
        const isUSD = (trade.currency || getDefaultCurrency(trade.assetType)) === "USD";
        const commEntryTHB = isUSD ? commEntryNative * exchangeRate : commEntryNative;
        const commShareTHB = isUSD ? commShare * exchangeRate : commShare;
        const netPnl = pnlBaht - commEntryTHB - commShareTHB;
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
      setSellTarget(null);
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

  const handleEditTrade = async (trade: TradeRecord) => {
    const commEntry = trade.commissionEntry ?? trade.commission ?? 0;
    const commExit = trade.commissionExit ?? 0;
    const cur = trade.currency || getDefaultCurrency(trade.assetType);
    const curSym = cur === "USD" ? "$" : "฿";
    const isUSD = cur === "USD";

    const { value } = await Swal.fire({
      title: `แก้ไข ${trade.symbol}`,
      width: 560,
      html: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;text-align:left;">
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">วันที่</div>
            <input id="pe-date" type="date" value="${trade.date}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Side</div>
            <select id="pe-side" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
              <option value="Buy" ${trade.side === 'Buy' ? 'selected' : ''}>Buy</option>
              <option value="Sell" ${trade.side === 'Sell' ? 'selected' : ''}>Sell</option>
            </select>
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">ราคาเข้า (${curSym})</div>
            <input id="pe-entry" type="number" step="any" value="${trade.entry}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">จำนวน</div>
            <input id="pe-contracts" type="number" step="any" value="${trade.contracts}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">ราคาออก (Exit) – ว่าง = ถือ</div>
            <input id="pe-exit" type="number" step="any" value="${trade.exit ?? ''}" placeholder="ว่าง = Open" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">FX Rate (฿/${cur})</div>
            <input id="pe-rate" type="number" step="any" value="${trade.exchangeRate || 1}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;" ${!isUSD ? 'readonly style="margin:0;width:100%;box-sizing:border-box;opacity:0.4;"' : ''}>
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">ค่าคอม ขาเข้า (${cur})</div>
            <input id="pe-comm-entry" type="number" step="any" value="${commEntry}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div>
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">ค่าคอม ขาออก (${cur})</div>
            <input id="pe-comm-exit" type="number" step="any" value="${commExit}" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div style="grid-column:span 2;">
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">กลยุทธ์</div>
            <input id="pe-strategy" type="text" value="${trade.strategy || ''}" placeholder="DCA, Breakout..." class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;">
          </div>
          <div style="grid-column:span 2;">
            <div style="font-size:10px;color:#9aa0a6;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">บันทึก</div>
            <textarea id="pe-notes" class="swal2-textarea" style="margin:0;width:100%;box-sizing:border-box;height:55px;resize:vertical;">${trade.notes || ''}</textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'บันทึกการแก้ไข',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#00d4aa',
      cancelButtonColor: '#3f3f46',
      preConfirm: () => {
        const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
        const entry = parseFloat(g('pe-entry'));
        const contracts = parseFloat(g('pe-contracts'));
        const side = g('pe-side') as 'Buy' | 'Sell';
        const exitStr = g('pe-exit');
        const er = parseFloat(g('pe-rate')) || 1;
        const ceEntry = parseFloat(g('pe-comm-entry')) || 0;
        const ceExit = parseFloat(g('pe-comm-exit')) || 0;

        if (!entry || !contracts) {
          Swal.showValidationMessage('กรุณากรอกราคาเข้าและจำนวน');
          return false;
        }

        const hasExit = exitStr !== '' && !isNaN(parseFloat(exitStr));
        const exit = hasExit ? parseFloat(exitStr) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: Record<string, any> = {
          date: g('pe-date'), side, entry, contracts,
          exchangeRate: er,
          commissionEntry: ceEntry,
          commissionExit: ceExit,
          strategy: g('pe-strategy') || undefined,
          notes: g('pe-notes') || undefined,
          status: hasExit ? 'closed' : 'open',
        };

        if (hasExit && exit !== undefined) {
          const diff = exit - entry;
          const pts = side === 'Buy' ? diff : -diff;
          const pnlBaht = pts * contracts * er;
          const commEntryTHB = isUSD ? ceEntry * er : ceEntry;
          const commExitTHB = isUSD ? ceExit * er : ceExit;
          const netPnl = pnlBaht - commEntryTHB - commExitTHB;
          updateData.exit = exit;
          updateData.points = Number(pts.toFixed(4));
          updateData.pnlBaht = Number(pnlBaht.toFixed(2));
          updateData.netPnl = Number(netPnl.toFixed(2));
        }
        return updateData;
      }
    });

    if (!value) return;
    try {
      await updateDoc(doc(db, 'trades', trade.id!), value);
      Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', showConfirmButton: false, timer: 1500 });
      await fetchPortfolioData();
    } catch (error) {
      console.error('Error updating trade:', error);
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถแก้ไขข้อมูลได้', 'error');
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

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="มูลค่ารวม (THB)" value={`฿${fmt(stats.totalPortfolioTHB)}`} subtitle={stats.totalCurrentTHB > 0 ? `สินทรัพย์ THB: ฿${fmt(stats.totalCurrentTHB)}` : undefined} icon={Wallet} iconColor="#60a5fa" iconBg="rgba(96,165,250,0.1)" onClick={() => setActiveDetail("thb")} />
        <StatCard title="มูลค่ารวม (USD)" value={`$${fmt(stats.totalPortfolioUSD)}`} subtitle={stats.totalCurrentUSD > 0 ? `สินทรัพย์ USD: $${fmt(stats.totalCurrentUSD)}` : undefined} icon={DollarSign} iconColor="#a78bfa" iconBg="rgba(167,139,250,0.1)" onClick={() => setActiveDetail("usd")} />
        <StatCard title="Unrealized P&L" value={`฿${stats.unrealizedCombinedTHB >= 0 ? '+' : ''}${fmt(stats.unrealizedCombinedTHB)}`} subtitle={stats.unrealizedUSD !== 0 ? `USD: $${stats.unrealizedUSD >= 0 ? '+' : ''}${fmt(stats.unrealizedUSD)}` : undefined} icon={TrendingUp} iconColor={stats.unrealizedCombinedTHB >= 0 ? "#34d399" : "#fb7185"} iconBg={stats.unrealizedCombinedTHB >= 0 ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)"} onClick={() => setActiveDetail("unrealized")} />
        <StatCard title="Realized P&L" value={`฿${stats.totalRealized >= 0 ? '+' : ''}${fmt(stats.totalRealized)}`} subtitle={`TFEX: ฿${tfexRealized >= 0 ? '+' : ''}${fmt(tfexRealized)}`} icon={Briefcase} iconColor={stats.totalRealized >= 0 ? "#34d399" : "#fb7185"} iconBg={stats.totalRealized >= 0 ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)"} onClick={() => setActiveDetail("realized")} />
      </div>

      {/* ── Holdings + Chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-start" />
            Holdings
            {holdings.length > 0 && <span className="text-[11px] text-textMuted/60 font-normal">({holdings.length} สินทรัพย์)</span>}
          </h3>

          {holdings.length === 0 ? (
            <div className="text-center py-16 text-textMuted/60 text-sm">ไม่มีสินทรัพย์ที่ถือครอง</div>
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
              <div className="text-textMuted/50 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>

          {(stats.totalCurrentTHB > 0 || stats.totalCurrentUSD > 0) && (
            <div className="space-y-2 pt-3 border-t border-white/[0.04]">
              <div className="text-[10px] font-semibold text-textMuted/60 uppercase tracking-widest px-1">แยกตามสกุลเงิน</div>
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
                <div className="flex justify-between text-[11px] text-textMuted/50 px-1">
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
                <tr><td colSpan={10} className="text-center py-16 text-textMuted/60 text-sm">ยังไม่มีข้อมูล</td></tr>
              ) : (
                trades.map((trade) => {
                  const cur = trade.currency || getDefaultCurrency(trade.assetType);
                  return (
                    <tr key={trade.id}>
                      <td className="font-mono text-xs text-textMuted/80 whitespace-nowrap">{trade.date}</td>
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
                      <td className="text-right text-textMuted/70 text-xs">{trade.contracts}</td>
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
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEditTrade(trade)} className="p-1.5 text-textMuted/40 hover:text-brand-start hover:bg-brand-start/10 rounded-lg transition-colors" title="แก้ไข">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(trade.id!)} className="p-1.5 text-textMuted/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="ลบ">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sell Modal */}
      {sellTarget && (
        <SellModal
          holding={sellTarget}
          rate={rate}
          initialPrice={currentPrices[sellTarget.key] || ""}
          onConfirm={handleSellConfirm}
          onClose={() => setSellTarget(null)}
        />
      )}

      {/* Detail Modal */}
      {activeDetail && (
        <DetailModal
          type={activeDetail}
          holdings={holdings}
          currentPrices={currentPrices}
          rate={rate}
          trades={trades}
          tfexRealized={tfexRealized}
          onClose={() => setActiveDetail(null)}
        />
      )}
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
          <span className="text-xs text-textMuted/70">{holdings.length} รายการ</span>
        </div>

        <div className="text-right flex items-center gap-4">
          <div className="hidden sm:block">
            <div className="text-[10px] text-textMuted/60">Value</div>
            <div className="font-mono font-bold text-xs">฿{fmt(totalValueTHB)}</div>
          </div>
          <div className="min-w-[80px]">
            <div className="text-[10px] text-textMuted/60">P&L</div>
            <div className={clsx("font-mono font-bold text-xs", unrealizedTHB > 0 ? "text-emerald-400" : unrealizedTHB < 0 ? "text-rose-400" : "text-textMuted/40")}>
              {unrealizedTHB >= 0 ? "+" : "-"}฿{fmt(Math.abs(unrealizedTHB))}
            </div>
            <div className={clsx("text-[10px] font-mono", unrealizedPct > 0 ? "text-emerald-400/80" : unrealizedPct < 0 ? "text-rose-400/80" : "text-textMuted/50")}>
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
  const cp = parseFloat(currentPrices[h.key] || "");
  const hasPrice = !isNaN(cp) && cp > 0;
  const curPrice = hasPrice ? cp : null;
  const sym = h.currency === "USD" ? "$" : "฿";

  let unrealizedPnl: number | null = null;
  let unrealizedPct: number | null = null;
  let currentValue: number | null = null;

  if (curPrice !== null) {
    const diff = curPrice - h.avgEntry;
    unrealizedPnl = diff * h.totalContracts;
    unrealizedPct = (diff / h.avgEntry) * 100;
    currentValue = curPrice * h.totalContracts;
  }

  const pnlPositive = unrealizedPnl !== null && unrealizedPnl > 0;
  const pnlNegative = unrealizedPnl !== null && unrealizedPnl < 0;

  return (
    <div className={clsx(
      "rounded-xl border bg-white dark:bg-white/[0.02] overflow-hidden transition-all duration-200",
      pnlPositive ? "border-emerald-500/20 dark:border-emerald-500/15"
        : pnlNegative ? "border-rose-500/20 dark:border-rose-500/15"
        : "border-gray-200 dark:border-white/[0.07]"
    )}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.05]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${badgeColor(h.assetType)}`}>
            {badgeLabel(h.assetType)}
          </span>
          <span className="font-bold text-sm truncate">{h.symbol}</span>
          {h.trades.length > 1 && (
            <span className="text-[9px] text-textMuted/30 bg-white/[0.04] px-1.5 py-0.5 rounded-full flex-shrink-0">
              {h.trades.length} lots
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-textMuted/60 bg-black/10 dark:bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
          {h.currency}
        </span>
      </div>

      {/* ── Info row ── */}
      <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/[0.03]">
        <div className="bg-white dark:bg-[#151515] px-4 py-2.5">
          <div className="text-[10px] text-textMuted/60 uppercase tracking-wider">ต้นทุนเฉลี่ย</div>
          <div className="font-mono font-semibold text-sm mt-0.5">{sym}{fmt(h.avgEntry)}</div>
        </div>
        <div className="bg-white dark:bg-[#151515] px-4 py-2.5">
          <div className="text-[10px] text-textMuted/60 uppercase tracking-wider">ปริมาณ</div>
          <div className="font-mono font-semibold text-sm mt-0.5">
            {fmt(h.totalContracts, h.totalContracts % 1 === 0 ? 0 : 4)}
            <span className="text-textMuted/50 text-[10px] ml-1">หน่วย</span>
          </div>
        </div>
      </div>

      {/* ── Price input ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[10px] text-textMuted/60 uppercase tracking-wider mb-1.5">ราคาปัจจุบัน</div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-textMuted/50 font-mono pointer-events-none">{sym}</span>
          <input
            type="number"
            step="any"
            placeholder="กรอกราคาปัจจุบัน..."
            className="w-full !py-2 !pl-6 !pr-8 text-sm font-mono !bg-gray-50 dark:!bg-white/[0.03] !border-gray-200 dark:!border-white/[0.06] rounded-lg"
            value={currentPrices[h.key] || ""}
            onChange={e => setCurrentPrices(prev => ({ ...prev, [h.key]: e.target.value }))}
          />
          {currentPrices[h.key] && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-textMuted/30 hover:text-white rounded-full transition-colors"
              onClick={() => setCurrentPrices(prev => { const n = { ...prev }; delete n[h.key]; return n; })}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── P&L / Value display ── */}
      <div className="px-4 pb-3">
        {unrealizedPnl !== null ? (
          <div className={clsx(
            "rounded-lg px-3 py-2.5 flex items-center justify-between",
            pnlPositive ? "bg-emerald-500/8 border border-emerald-500/15"
              : pnlNegative ? "bg-rose-500/8 border border-rose-500/15"
              : "bg-white/[0.03] border border-white/[0.05]"
          )}>
            <div>
              <div className="text-[10px] text-textMuted/60 uppercase tracking-wider">Unrealized P&L</div>
              <div className={clsx(
                "font-mono font-bold text-base leading-tight mt-0.5",
                pnlPositive ? "text-emerald-400" : pnlNegative ? "text-rose-400" : "text-textMuted"
              )}>
                {unrealizedPnl >= 0 ? "+" : "-"}{sym}{fmt(Math.abs(unrealizedPnl))}
              </div>
              <div className={clsx(
                "text-[11px] font-mono",
                pnlPositive ? "text-emerald-400/80" : pnlNegative ? "text-rose-400/80" : "text-textMuted/50"
              )}>
                {unrealizedPct! >= 0 ? "+" : ""}{unrealizedPct!.toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-textMuted/60 uppercase tracking-wider">มูลค่า</div>
              <div className="font-mono font-semibold text-sm mt-0.5">{sym}{fmt(currentValue!)}</div>
              {h.currency === "USD" && rate > 0 && (
                <div className="text-[10px] font-mono text-purple-400/70 mt-0.5">≈ ฿{fmt(currentValue! * rate)}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg px-3 py-2.5 bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.04] flex items-center justify-between">
            <div className="text-[10px] text-textMuted/60 uppercase tracking-wider">มูลค่าต้นทุน</div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-sm text-textMuted/80">{sym}{fmt(h.totalInvestedOriginal)}</div>
              {h.currency === "USD" && rate > 0 && (
                <div className="text-[10px] font-mono text-purple-400/60">≈ ฿{fmt(h.totalInvestedOriginal * rate)}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Sell button ── */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onSell(h)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-xs font-semibold text-textMuted/70 hover:text-brand-start hover:border-brand-start/30 hover:bg-brand-start/5 transition-all duration-150"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          ขาย / ปิดสถานะ
        </button>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, iconColor, iconBg, onClick }: {
  title: string; value: string; subtitle?: string; icon: React.ElementType; iconColor: string; iconBg: string; onClick?: () => void;
}) {
  return (
    <div
      className={clsx("card !p-4 group hover:!border-white/[0.12] transition-all duration-200", onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]")}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-textMuted/80 uppercase tracking-wider truncate">{title}</div>
          <div className="text-lg font-bold font-mono tracking-tight mt-0.5 truncate">{value}</div>
          {subtitle && <div className="text-[10px] text-textMuted/60 font-mono mt-0.5 truncate">{subtitle}</div>}
        </div>
        {onClick && (
          <div className="flex-shrink-0 text-textMuted/30 group-hover:text-textMuted/60 transition-colors mt-0.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── DetailModal ── */
function DetailModal({ type, holdings, currentPrices, rate, trades, tfexRealized, onClose }: {
  type: "thb" | "usd" | "unrealized" | "realized";
  holdings: AggregatedHolding[];
  currentPrices: Record<string, string>;
  rate: number;
  trades: TradeRecord[];
  tfexRealized: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const titles: Record<string, string> = {
    thb: "มูลค่ารวม (THB)",
    usd: "มูลค่ารวม (USD)",
    unrealized: "Unrealized P&L — รายละเอียด",
    realized: "Realized P&L — รายละเอียด",
  };

  const thbHoldings = holdings.filter(h => h.currency === "THB");
  const usdHoldings = holdings.filter(h => h.currency === "USD");

  const holdingsWithPnl = holdings.map(h => {
    const cp = parseFloat(currentPrices[h.key] || "");
    const hasPrice = !isNaN(cp) && cp > 0;
    const curPrice = hasPrice ? cp : h.avgEntry;
    const diff = curPrice - h.avgEntry;
    const pnl = diff * h.totalContracts;
    const pnlTHB = h.currency === "USD" ? pnl * rate : pnl;
    const pct = (diff / h.avgEntry) * 100;
    return { ...h, pnl, pnlTHB, pct, hasPrice, curPrice };
  }).sort((a, b) => b.pnlTHB - a.pnlTHB);

  const closedInvTrades = trades.filter(t => t.status !== "open");
  const realizedBySymbol: Record<string, { symbol: string; assetType: string; pnl: number }> = {};
  closedInvTrades.forEach(t => {
    const key = `${t.symbol}_${t.assetType}`;
    if (!realizedBySymbol[key]) {
      realizedBySymbol[key] = { symbol: t.symbol, assetType: t.assetType || "", pnl: 0 };
    }
    realizedBySymbol[key].pnl += t.netPnl ?? 0;
  });
  const realizedEntries = Object.values(realizedBySymbol).sort((a, b) => b.pnl - a.pnl);
  const investmentRealized = closedInvTrades.reduce((sum, t) => sum + (t.netPnl ?? 0), 0);
  const grandRealized = tfexRealized + investmentRealized;

  const thbTotal = thbHoldings.reduce((sum, h) => {
    const cp = parseFloat(currentPrices[h.key] || "");
    return sum + (!isNaN(cp) && cp > 0 ? cp : h.avgEntry) * h.totalContracts;
  }, 0);
  const usdTotal = usdHoldings.reduce((sum, h) => {
    const cp = parseFloat(currentPrices[h.key] || "");
    return sum + (!isNaN(cp) && cp > 0 ? cp : h.avgEntry) * h.totalContracts;
  }, 0);
  const unrealizedTotal = holdingsWithPnl.reduce((s, h) => s + h.pnlTHB, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#151515] rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl w-full sm:max-w-[480px] max-h-[85vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="font-bold text-base text-white">{titles[type]}</div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-2.5">

          {/* ── THB ── */}
          {type === "thb" && (
            thbHoldings.length === 0
              ? <div className="text-center py-10 text-white/50 text-sm">ไม่มีสินทรัพย์ THB</div>
              : <>
                {thbHoldings.map(h => {
                  const cp = parseFloat(currentPrices[h.key] || "");
                  const hasPrice = !isNaN(cp) && cp > 0;
                  const curPrice = hasPrice ? cp : h.avgEntry;
                  const curValue = curPrice * h.totalContracts;
                  return (
                    <div key={h.key} className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                      <div>
                        <div className="font-semibold text-sm text-white">{h.symbol}</div>
                        <div className="text-[11px] text-white/70 mt-0.5 font-mono">
                          {fmt(h.totalContracts, h.totalContracts % 1 === 0 ? 0 : 4)} หน่วย × ฿{fmt(curPrice)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold text-sm text-white">฿{fmt(curValue)}</div>
                        {!hasPrice && <div className="text-[10px] text-amber-400/70">ต้นทุน</div>}
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center pt-3 border-t border-white/[0.06]">
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">รวม</span>
                  <span className="font-mono font-bold text-base text-white">฿{fmt(thbTotal)}</span>
                </div>
              </>
          )}

          {/* ── USD ── */}
          {type === "usd" && (
            usdHoldings.length === 0
              ? <div className="text-center py-10 text-white/50 text-sm">ไม่มีสินทรัพย์ USD</div>
              : <>
                {usdHoldings.map(h => {
                  const cp = parseFloat(currentPrices[h.key] || "");
                  const hasPrice = !isNaN(cp) && cp > 0;
                  const curPrice = hasPrice ? cp : h.avgEntry;
                  const curValue = curPrice * h.totalContracts;
                  return (
                    <div key={h.key} className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
                      <div>
                        <div className="font-semibold text-sm text-white">{h.symbol}</div>
                        <div className="text-[11px] text-white/70 mt-0.5 font-mono">
                          {fmt(h.totalContracts, h.totalContracts % 1 === 0 ? 0 : 4)} หน่วย × ${fmt(curPrice)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold text-sm text-white">${fmt(curValue)}</div>
                        {rate > 0 && <div className="text-[10px] font-mono text-purple-400/70">≈ ฿{fmt(curValue * rate)}</div>}
                        {!hasPrice && <div className="text-[10px] text-amber-400/70">ต้นทุน</div>}
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between items-center pt-3 border-t border-white/[0.06]">
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">รวม</span>
                  <div className="text-right">
                    <div className="font-mono font-bold text-base text-white">${fmt(usdTotal)}</div>
                    {rate > 0 && <div className="text-[11px] font-mono text-purple-400/70">≈ ฿{fmt(usdTotal * rate)}</div>}
                  </div>
                </div>
              </>
          )}

          {/* ── Unrealized ── */}
          {type === "unrealized" && (
            holdingsWithPnl.length === 0
              ? <div className="text-center py-10 text-white/50 text-sm">ไม่มีสินทรัพย์ที่ถือครอง</div>
              : <>
                {holdingsWithPnl.map(h => (
                  <div key={h.key} className={clsx(
                    "flex items-center justify-between p-3.5 rounded-xl border transition-colors",
                    h.pnlTHB > 0 ? "bg-emerald-500/[0.04] border-emerald-500/15"
                      : h.pnlTHB < 0 ? "bg-rose-500/[0.04] border-rose-500/15"
                      : "bg-white/[0.03] border-white/[0.06]"
                  )}>
                    <div>
                      <div className="font-semibold text-sm text-white">{h.symbol}</div>
                      <div className="text-[11px] text-white/60 mt-0.5 font-mono">
                        {h.currency === "USD" ? "$" : "฿"}{fmt(h.avgEntry)}
                        {h.hasPrice && <> → {h.currency === "USD" ? "$" : "฿"}{fmt(h.curPrice)}</>}
                        {!h.hasPrice && <span className="ml-1 text-amber-400/70">(ไม่มีราคา)</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={clsx(
                        "font-mono font-bold text-sm",
                        h.pnlTHB > 0 ? "text-emerald-400" : h.pnlTHB < 0 ? "text-rose-400" : "text-white/40"
                      )}>
                        {h.pnlTHB >= 0 ? "+" : ""}฿{fmt(h.pnlTHB)}
                      </div>
                      <div className={clsx(
                        "text-[10px] font-mono",
                        h.pct > 0 ? "text-emerald-400/80" : h.pct < 0 ? "text-rose-400/80" : "text-white/50"
                      )}>
                        {h.pct >= 0 ? "+" : ""}{h.pct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t border-white/[0.06]">
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">รวม Unrealized</span>
                  <span className={clsx("font-mono font-bold text-base", unrealizedTotal >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {unrealizedTotal >= 0 ? "+" : ""}฿{fmt(unrealizedTotal)}
                  </span>
                </div>
              </>
          )}

          {/* ── Realized ── */}
          {type === "realized" && (
            <>
              {/* TFEX */}
              <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest px-1">TFEX</div>
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <div className="font-semibold text-sm text-white">TFEX (Futures)</div>
                  <div className="text-[11px] text-white/60 mt-0.5">สัญญา Futures ทั้งหมด</div>
                </div>
                <span className={clsx("font-mono font-bold text-sm", tfexRealized >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {tfexRealized >= 0 ? "+" : ""}฿{fmt(tfexRealized)}
                </span>
              </div>

              {/* Investment */}
              {realizedEntries.length > 0 && <>
                <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest px-1 pt-1">การลงทุน</div>
                {realizedEntries.map(entry => (
                  <div key={`${entry.symbol}_${entry.assetType}`} className={clsx(
                    "flex items-center justify-between p-3.5 rounded-xl border transition-colors",
                    entry.pnl > 0 ? "bg-emerald-500/[0.04] border-emerald-500/15"
                      : entry.pnl < 0 ? "bg-rose-500/[0.04] border-rose-500/15"
                      : "bg-white/[0.03] border-white/[0.06]"
                  )}>
                    <div>
                      <div className="font-semibold text-sm text-white">{entry.symbol}</div>
                      <div className="text-[11px] text-white/60 mt-0.5">{entry.assetType.replace("_", " ")}</div>
                    </div>
                    <span className={clsx("font-mono font-bold text-sm", entry.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {entry.pnl >= 0 ? "+" : ""}฿{fmt(entry.pnl)}
                    </span>
                  </div>
                ))}
              </>}

              {realizedEntries.length === 0 && tfexRealized === 0 && (
                <div className="text-center py-6 text-white/50 text-sm">ยังไม่มีกำไร/ขาดทุนที่รับรู้แล้ว</div>
              )}

              {/* Grand total */}
              <div className="flex justify-between items-center pt-3 border-t border-white/[0.06]">
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">รวม Realized</span>
                <span className={clsx("font-mono font-bold text-base", grandRealized >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {grandRealized >= 0 ? "+" : ""}฿{fmt(grandRealized)}
                </span>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── SellModal ── */
function SellModal({ holding: h, rate, initialPrice, onConfirm, onClose }: {
  holding: AggregatedHolding;
  rate: number;
  initialPrice: string;
  onConfirm: (exit: number, commission: number) => Promise<void>;
  onClose: () => void;
}) {
  const [exitPrice, setExitPrice] = useState(initialPrice);
  const [commission, setCommission] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const sym = h.currency === "USD" ? "$" : "฿";

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Live P&L calculation
  const preview = useMemo(() => {
    const exit = parseFloat(exitPrice);
    if (!exit || isNaN(exit)) return null;
    const diff = exit - h.avgEntry;
    const rawPnl = diff * h.totalContracts;
    const comm = parseFloat(commission) || 0;
    const pnlTHB = h.currency === "USD" ? rawPnl * rate - comm : rawPnl - comm;
    const pct = (diff / h.avgEntry) * 100;
    return { pnlTHB, pct };
  }, [exitPrice, commission, h, rate]);

  const handleSubmit = async () => {
    const exit = parseFloat(exitPrice);
    if (!exit || isNaN(exit)) return;
    setSubmitting(true);
    try { await onConfirm(exit, parseFloat(commission) || 0); }
    finally { setSubmitting(false); }
  };

  const canSubmit = !submitting && !!exitPrice && !isNaN(parseFloat(exitPrice));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-[#151515] rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl w-full sm:max-w-[440px] overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div>
            <div className="font-bold text-lg text-white">ขาย / ปิดสถานะ</div>
            <div className="text-xs text-white/70 mt-0.5 flex items-center gap-1.5">
              <span className="font-semibold text-white/70">{h.symbol}</span>
              <span className="text-white/30">·</span>
              <span>{h.assetType.replace("_", " ")}</span>
              <span className="text-white/30">·</span>
              <span className="font-mono text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded">{h.currency}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Holding summary */}
        <div className="grid grid-cols-3 border-b border-white/[0.06] bg-white/[0.015]">
          {[
            { label: "ต้นทุนเฉลี่ย", value: `${sym}${fmt(h.avgEntry)}` },
            { label: "ปริมาณ", value: `${fmt(h.totalContracts, h.totalContracts % 1 === 0 ? 0 : 4)}` },
            { label: "มูลค่าต้นทุน", value: `${sym}${fmt(h.totalInvestedOriginal)}` },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3 border-r border-white/[0.06] last:border-r-0">
              <div className="text-[10px] text-white/60 uppercase tracking-wider">{label}</div>
              <div className="font-mono font-semibold text-xs mt-0.5 truncate text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">

          {/* Exit price */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70 uppercase tracking-wider block">
              ราคาขาย (Exit Price) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/60 font-mono pointer-events-none">{sym}</span>
              <input
                type="number"
                step="any"
                autoFocus
                placeholder="0.00"
                value={exitPrice}
                onChange={e => setExitPrice(e.target.value)}
                onKeyDown={e => e.key === "Enter" && canSubmit && handleSubmit()}
                className="w-full !pl-8 !py-3 text-xl font-mono font-semibold focus:!border-brand-start/50 transition-colors"
              />
            </div>
          </div>

          {/* Commission */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70 uppercase tracking-wider block">
              ค่าธรรมเนียม ขาออก รวม (฿)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/60 font-mono pointer-events-none">฿</span>
              <input
                type="number"
                step="any"
                placeholder="0.00"
                value={commission}
                onChange={e => setCommission(e.target.value)}
                className="w-full !pl-8 !py-2.5 font-mono"
              />
            </div>
          </div>

          {/* Live P&L Preview */}
          <div className={clsx(
            "rounded-xl border transition-all duration-300 overflow-hidden",
            preview === null
              ? "border-white/[0.06] bg-white/[0.02]"
              : preview.pnlTHB >= 0
              ? "border-emerald-500/25 bg-emerald-500/[0.05]"
              : "border-rose-500/25 bg-rose-500/[0.05]"
          )}>
            {preview === null ? (
              <div className="px-4 py-4 text-center text-xs text-white/50">
                กรอกราคาขายเพื่อดูประมาณการ P&L
              </div>
            ) : (
              <div className="px-4 py-4 text-center">
                <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1.5">ประมาณการ Net P&L</div>
                <div className={clsx(
                  "text-3xl font-bold font-mono tracking-tight",
                  preview.pnlTHB >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {preview.pnlTHB >= 0 ? "+" : ""}฿{fmt(preview.pnlTHB)}
                </div>
                <div className={clsx(
                  "text-sm font-mono mt-1",
                  preview.pct >= 0 ? "text-emerald-400/80" : "text-rose-400/80"
                )}>
                  {preview.pct >= 0 ? "+" : ""}{preview.pct.toFixed(2)}%
                  {h.currency === "USD" && rate > 0 && (
                    <span className="ml-2 text-white/50 text-[10px]">@ ฿{fmt(rate, 2)}/$</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2.5">
          <button onClick={onClose} className="btn btn-secondary flex-1 !py-2.5">
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn btn-primary flex-1 !py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : "ยืนยันการขาย"}
          </button>
        </div>
      </div>
    </div>
  );
}
