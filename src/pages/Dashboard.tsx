import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { DEFAULT_MULTIPLIERS } from "../lib/constants";
import type { TradeRecord } from "../types";
import { Link } from "react-router-dom";
import {
  Wallet, Target, BarChart3, TrendingUp, TrendingDown, Trophy, ArrowUpRight, X
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import clsx from "clsx";

// Register ChartJS plugins
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, ArcElement, Filler
);

// Chart Theme Configuration
ChartJS.defaults.color = '#9aa0a6';
ChartJS.defaults.font.family = '"Outfit", "Noto Sans Thai", sans-serif';
ChartJS.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

export default function Dashboard() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeRecord[]>([]);        // closed only
  const [openTrades, setOpenTrades] = useState<TradeRecord[]>([]); // open positions
  const [recentTrades, setRecentTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysFilter, setDaysFilter] = useState("all");
  const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Fetch all trades (sort client-side to avoid composite index requirement)
        const qAll = query(
          collection(db, "trades"),
          where("userId", "==", user.uid)
        );
        const snapshotAll = await getDocs(qAll);
        const allData = snapshotAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TradeRecord[];

        // Separate open vs closed
        const closed = allData
          .filter(t => t.status !== "open")
          .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        const open = allData
          .filter(t => t.status === "open")
          .sort((a, b) => b.date < a.date ? -1 : 1);

        // Recent closed trades: top 5 by date desc
        const recentData = [...closed]
          .sort((a, b) => {
            if (b.date !== a.date) return b.date < a.date ? -1 : 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aTs = (a.createdAt as any)?.seconds ?? 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bTs = (b.createdAt as any)?.seconds ?? 0;
            return bTs - aTs;
          })
          .slice(0, 5);

        setTrades(closed);
        setOpenTrades(open);
        setRecentTrades(recentData);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  // Derived Stats
  const stats = useMemo(() => {
    let filtered = trades;
    
    if (daysFilter !== "all") {
      const days = parseInt(daysFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      filtered = trades.filter(t => t.date >= cutoffStr);
    }

    let totalNetPnl = 0;
    let winCount = 0;
    let netProfit = 0;
    let netLoss = 0;
    let maxDrawdown = 0;
    let peakEquity = 0;
    let currentEquity = 0;
    // let totalContracts = 0;

    const cumulativePnL: number[] = [0];
    const dailyPnLMap: Record<string, number> = {};
    const strategyPnLMap: Record<string, number> = {};
    const symbolPnLMap: Record<string, number> = {};

    filtered.forEach(t => {
      const pnl = t.netPnl ?? 0;
      totalNetPnl += pnl;
      currentEquity += pnl;
      cumulativePnL.push(currentEquity);

      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const drawdown = peakEquity - currentEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (pnl > 0) {
        winCount++;
        netProfit += pnl;
      } else if (pnl < 0) {
        netLoss += Math.abs(pnl);
      }
      
      // totalContracts += t.contracts;

      // Groupings
      dailyPnLMap[t.date] = (dailyPnLMap[t.date] || 0) + pnl;

      const strat = t.strategy || 'Unknown';
      strategyPnLMap[strat] = (strategyPnLMap[strat] || 0) + pnl;

      const sym = t.symbol || 'Unknown';
      symbolPnLMap[sym] = (symbolPnLMap[sym] || 0) + pnl;
    });

    const totalTrades = filtered.length;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    const avgPnl = totalTrades > 0 ? totalNetPnl / totalTrades : 0;
    const profitFactor = netLoss > 0 ? netProfit / netLoss : (netProfit > 0 ? 999 : 0);

    return {
      totalTrades,
      totalNetPnl,
      winRate,
      avgPnl,
      maxDrawdown,
      profitFactor,
      cumulativePnL,
      dailyPnLMap,
      strategyPnLMap,
      symbolPnLMap,
      dates: filtered.map(t => t.date),
      netPnls: filtered.map(t => t.netPnl ?? 0)
    };
  }, [trades, daysFilter]);

  // Chart Configurations
  const equityData = {
    labels: Array.from({ length: stats.cumulativePnL.length }, (_, i) => i === 0 ? 'Start' : stats.dates[i-1]),
    datasets: [{
      label: 'Equity (฿)',
      data: stats.cumulativePnL,
      borderColor: '#00d4aa',
      backgroundColor: 'rgba(0, 212, 170, 0.1)',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 5
    }]
  };

  const dailyLabels = Object.keys(stats.dailyPnLMap).sort();
  const dailyData = {
    labels: dailyLabels,
    datasets: [{
      label: 'Daily P&L (฿)',
      data: dailyLabels.map(d => stats.dailyPnLMap[d]),
      backgroundColor: dailyLabels.map(d => stats.dailyPnLMap[d] >= 0 ? 'rgba(52, 211, 153, 0.8)' : 'rgba(251, 113, 133, 0.8)'),
      borderRadius: 4
    }]
  };
  
  const strategyLabels = Object.keys(stats.strategyPnLMap).sort((a,b) => stats.strategyPnLMap[b] - stats.strategyPnLMap[a]);
  const strategyData = {
    labels: strategyLabels,
    datasets: [{
      label: 'P&L By Strategy (฿)',
      data: strategyLabels.map(s => stats.strategyPnLMap[s]),
      backgroundColor: strategyLabels.map(s => stats.strategyPnLMap[s] >= 0 ? 'rgba(52, 211, 153, 0.8)' : 'rgba(251, 113, 133, 0.8)'),
      borderRadius: 4
    }]
  };

  const symbolLabels = Object.keys(stats.symbolPnLMap).sort((a,b) => stats.symbolPnLMap[b] - stats.symbolPnLMap[a]);
  const symbolData = {
    labels: symbolLabels,
    datasets: [{
      data: symbolLabels.map(s => Math.abs(stats.symbolPnLMap[s])),
      backgroundColor: [
        '#00d4aa', '#7c5cfc', '#f59e0b', '#ec4899', '#3b82f6', '#10b981'
      ],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { border: { dash: [4, 4] } }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doughnutOptions: any = {
    maintainAspectRatio: false, 
    cutout: '75%',
    plugins: {
       legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 text-brand-start">
          <div className="w-10 h-10 border-4 border-brand-start border-t-transparent rounded-full animate-spin"></div>
          <span className="font-medium animate-pulse">กำลังโหลดข้อมูล...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-textMuted text-sm mt-1">ภาพรวมผลการเทรดของคุณ</p>
        </div>
        <div>
          <select 
            className="w-full sm:w-auto rounded-xl px-4 py-2"
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="7">7 วันล่าสุด</option>
            <option value="30">30 วันล่าสุด</option>
            <option value="90">90 วันล่าสุด</option>
          </select>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard 
          title="กำไร/ขาดทุนสุทธิ" 
          value={`฿${stats.totalNetPnl.toLocaleString('en-US', {minimumFractionDigits: 2})}`}
          icon={Wallet}
          colorClass="from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20"
        />
        <StatCard 
          title="Win Rate" 
          value={`${stats.winRate.toFixed(1)}%`}
          icon={Target}
          colorClass="from-blue-500/20 to-blue-500/5 text-blue-400 border-blue-500/20"
        />
        <StatCard 
          title="จำนวนเทรด" 
          value={stats.totalTrades.toString()}
          icon={BarChart3}
          colorClass="from-purple-500/20 to-purple-500/5 text-purple-400 border-purple-500/20"
        />
        <StatCard 
          title="Avg P&L / Trade" 
          value={`฿${stats.avgPnl.toLocaleString('en-US', {minimumFractionDigits: 2})}`}
          icon={TrendingUp}
          colorClass="from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20"
        />
        <StatCard 
          title="Max Drawdown" 
          value={`฿${stats.maxDrawdown.toLocaleString('en-US', {minimumFractionDigits: 2})}`}
          icon={TrendingDown}
          colorClass="from-rose-500/20 to-rose-500/5 text-rose-400 border-rose-500/20"
        />
        <StatCard 
          title="Profit Factor" 
          value={stats.profitFactor > 99 ? '∞' : stats.profitFactor.toFixed(2)}
          icon={Trophy}
          colorClass="from-cyan-500/20 to-cyan-500/5 text-cyan-400 border-cyan-500/20"
        />
      </div>

      {/* Open Positions Widget */}
      {openTrades.length > 0 && (
        <div className="card border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse"></div>
              <h3 className="font-semibold">สัญญาที่เปิดอยู่</h3>
              <span className="text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                {openTrades.length} รายการ
              </span>
            </div>
            <Link to="/trades" className="text-xs text-brand-start hover:text-brand-end flex items-center gap-1 transition-colors">
              จัดการ <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {openTrades.map(trade => {
              const cp = parseFloat(currentPrices[trade.id!] || "");
              let urNet: number | null = null;
              // let urPts: number | null = null;
              if (!isNaN(cp) && cp > 0) {
                const mult = DEFAULT_MULTIPLIERS[trade.symbol] ?? DEFAULT_MULTIPLIERS.Other;
                const diff = cp - trade.entry;
                const pts = trade.side === "Long" ? diff : -diff;
                const commEntry = trade.commissionEntry ?? trade.commission ?? 0;
                urNet = pts * mult * trade.contracts - commEntry;
                // urPts = pts;
              }
              return (
                <div key={trade.id} className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-surfaceLight/60 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{trade.symbol}</span>
                    {trade.series && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">{trade.series}</span>}
                    <span className={clsx(
                      "px-2 py-0.5 rounded-md text-xs font-bold",
                      trade.side === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    )}>{trade.side}</span>
                    <span className="text-xs text-textMuted ml-auto">{trade.date}</span>
                  </div>
                  <div className="text-sm text-textMuted">
                    Entry: <span className="text-gray-900 dark:text-white font-mono">{trade.entry}</span>
                    &nbsp;·&nbsp; {trade.contracts} สัญญา
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="any"
                        placeholder="ราคาปัจจุบัน..."
                        className="w-full py-1 text-sm rounded-lg pr-6"
                        value={currentPrices[trade.id!] || ""}
                        onChange={e => setCurrentPrices(prev => ({ ...prev, [trade.id!]: e.target.value }))}
                      />
                      {currentPrices[trade.id!] && (
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-gray-700 dark:hover:text-white"
                          onClick={() => setCurrentPrices(prev => { const n = { ...prev }; delete n[trade.id!]; return n; })}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className={clsx(
                      "text-right text-sm font-mono font-bold min-w-[80px]",
                      urNet === null ? "text-textMuted" : urNet > 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {urNet === null ? "—" : `${urNet >= 0 ? "+" : "-"}฿${Math.abs(urNet).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-3 space-y-4">
          <h3 className="font-semibold px-2">Equity Curve</h3>
          <div className="h-72 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Line data={equityData} options={chartOptions as any} />
          </div>
        </div>

        <div className="card lg:col-span-2 space-y-4">
          <h3 className="font-semibold px-2">Daily P&L</h3>
          <div className="h-64 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Bar data={dailyData} options={chartOptions as any} />
          </div>
        </div>

        <div className="card lg:col-span-1 space-y-4">
          <h3 className="font-semibold px-2 text-center">P&L by Symbol</h3>
          <div className="h-64 w-full flex items-center justify-center relative">
            <Doughnut 
              data={symbolData} 
              options={doughnutOptions}
            />
          </div>
        </div>

        <div className="card lg:col-span-3 space-y-4">
          <h3 className="font-semibold px-2">P&L by Strategy</h3>
           <div className="h-64 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Bar data={strategyData} options={{...chartOptions, indexAxis: 'y'} as any} />
          </div>
        </div>
      </div>

      {/* Recent Trades Table */}
      <div className="card space-y-4 !p-0 overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-2">
          <h3 className="font-semibold text-lg">เทรดล่าสุด</h3>
          <Link to="/trades" className="text-sm text-brand-start hover:text-brand-end flex items-center gap-1 transition-colors">
            ดูทั้งหมด <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead className="bg-surfaceLight/30">
              <tr>
                <th>วันที่</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Exit</th>
                <th className="text-right">สัญญา</th>
                <th className="text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-textMuted">ยังไม่มีข้อมูลการเทรด</td>
                </tr>
              ) : (
                recentTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="font-mono text-xs">{trade.date}</td>
                    <td className="font-bold">{trade.symbol}</td>
                    <td>
                      <span className={clsx(
                        "px-2 py-1 rounded-md text-[0.7rem] font-bold uppercase tracking-wider",
                        trade.side === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      )}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="text-right font-mono text-sm">{trade.entry}</td>
                    <td className="text-right font-mono text-sm">{trade.exit ?? "—"}</td>
                    <td className="text-right text-textMuted text-sm">{trade.contracts}</td>
                    <td className={clsx(
                      "text-right font-mono font-bold text-sm",
                      (trade.netPnl ?? 0) > 0 ? "text-emerald-400" : (trade.netPnl ?? 0) < 0 ? "text-rose-400" : "text-textMuted"
                    )}>
                      {(trade.netPnl ?? 0) > 0 ? '+' : ''}{(trade.netPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatCard({ title, value, icon: Icon, colorClass }: { title: string, value: string, icon: any, colorClass: string }) {
  return (
    <div className={clsx("rounded-2xl p-5 border bg-gradient-to-br relative overflow-hidden group transition-all duration-300 hover:scale-105", colorClass)}>
      <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity duration-300 group-hover:scale-110">
        <Icon className="w-12 h-12" />
      </div>
      <div className="relative z-10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-surface/50 flex items-center justify-center backdrop-blur-sm">
            <Icon className="w-4 h-4 text-current" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">{title}</span>
        </div>
        <div className="text-xl lg:text-2xl font-bold font-mono tracking-tight drop-shadow-sm">
          {value}
        </div>
      </div>
    </div>
  );
}
