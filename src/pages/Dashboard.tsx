import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { DEFAULT_MULTIPLIERS } from "../lib/constants";
import type { TradeRecord } from "../types";
import {
  Wallet, Target, BarChart3, TrendingUp, TrendingDown, Trophy, X,
  ArrowUpDown, Download, Trash2, Search
} from "lucide-react";
import Swal from "sweetalert2";

// Helper: get commission entry (backward-compat with legacy `commission` field)
const getCommEntry = (t: TradeRecord) => t.commissionEntry ?? t.commission ?? 0;
const getCommExit = (t: TradeRecord) => t.commissionExit ?? 0;
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
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import clsx from "clsx";

// Register ChartJS plugins
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
);

// Chart Theme Configuration
ChartJS.defaults.color = '#9aa0a6';
ChartJS.defaults.font.family = '"Outfit", "Noto Sans Thai", sans-serif';
ChartJS.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

export default function Dashboard() {
  const { user } = useAuth();
  const [allTrades, setAllTrades] = useState<TradeRecord[]>([]);
  const [allOpenTrades, setAllOpenTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [daysFilter, setDaysFilter] = useState("all");
  const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({});

  const [searchTerm, setSearchTerm] = useState("");
  const [multipliers, setMultipliers] = useState<Record<string, number>>(DEFAULT_MULTIPLIERS);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TradeRecord | "netPnl";
    direction: "asc" | "desc";
  }>({ key: "date", direction: "desc" });

  const fetchDashboardData = useCallback(async () => {
      if (!user) return;
      setLoading(true);
      try {
        const qAll = query(
          collection(db, "trades"),
          where("userId", "==", user.uid)
        );
        const snapshotAll = await getDocs(qAll);
        const fetchedData = snapshotAll.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TradeRecord[];

        const tfexData = fetchedData.filter(t => !t.assetType || t.assetType === "TFEX");

        const closed = tfexData
          .filter(t => t.status !== "open")
          .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        const open = tfexData
          .filter(t => t.status === "open")
          .sort((a, b) => b.date < a.date ? -1 : 1);

        setAllTrades(closed);
        setAllOpenTrades(open);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      try {
        const docSnap = await getDocs(query(collection(db, "user_settings"), where("userId", "==", user.uid)));
        if (!docSnap.empty) {
          const data = docSnap.docs[0].data();
          if (data.multipliers) setMultipliers(prev => ({ ...prev, ...data.multipliers }));
        }
      } catch { /* ignore */ }
    };
    fetchSettings();
  }, [user]);

  // Apply filters
  const { trades, openTrades, filteredAndSortedClosed } = useMemo(() => {
    let closed = allTrades;
    const open = allOpenTrades;

    if (daysFilter !== "all") {
      const days = parseInt(daysFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      closed = closed.filter(t => t.date >= cutoffStr);
    }

    let result = closed;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(term) ||
        t.series?.toLowerCase().includes(term) ||
        t.strategy?.toLowerCase().includes(term) ||
        t.notes?.toLowerCase().includes(term) ||
        (t.assetType && t.assetType.toLowerCase().includes(term)) ||
        t.date.includes(term)
      );
    }

    const sortedResult = [...result].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof TradeRecord];
      const bVal = b[sortConfig.key as keyof TradeRecord];
      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return { trades: closed, openTrades: open, filteredAndSortedClosed: sortedResult };
  }, [allTrades, allOpenTrades, daysFilter, searchTerm, sortConfig]);

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: "ยืนยันการลบ",
      text: "คุณต้องการลบรายการเทรดนี้ใช่หรือไหม?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ใช่, ลบเลย",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#3f3f46"
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

  const handleClosePosition = async (trade: TradeRecord) => {
    const isTfex = trade.assetType === "TFEX" || !trade.assetType;
    const titleStr = `ปิดสถานะ ${trade.symbol}${trade.series ? ` ${trade.series}` : ""}`;
    const subStr = `Entry: <b>${trade.entry}</b> &nbsp;|&nbsp; ${trade.side} &nbsp;|&nbsp; ${trade.contracts} ${isTfex ? 'สัญญา' : 'หน่วย'}`;

    const { value: formValues } = await Swal.fire({
      title: titleStr,
      html: `
        <div style="text-align:left; margin-bottom:16px; font-size:0.85rem; color:#9aa0a6">
          ${subStr}
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <input id="swal-exit" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" type="number" step="any" placeholder="ราคาออก (Exit) *" autofocus>
          <input id="swal-comm" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" type="number" step="any" placeholder="ค่าธรรมเนียม ขาออก (฿)" value="0">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "ยืนยันการปิดรับรู้รายได้",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#00d4aa",
      cancelButtonColor: "#3f3f46",
      preConfirm: () => {
        const exit = parseFloat((document.getElementById("swal-exit") as HTMLInputElement).value);
        const commExit = parseFloat((document.getElementById("swal-comm") as HTMLInputElement).value) || 0;
        if (!exit || isNaN(exit)) {
          Swal.showValidationMessage("กรุณากรอกราคาออก");
          return false;
        }
        return { exit, commExit };
      }
    });

    if (!formValues) return;

    const { exit, commExit } = formValues;
    const pointDiff = exit - trade.entry;
    const pts = (trade.side === "Long" || trade.side === "Buy") ? pointDiff : -pointDiff;

    let pnlBaht = 0;
    if (isTfex) {
      const multiplier = multipliers[trade.symbol] || DEFAULT_MULTIPLIERS.Other || 1;
      pnlBaht = pts * multiplier * trade.contracts;
    } else {
      const exchangeRate = trade.exchangeRate || 1;
      pnlBaht = pts * trade.contracts * exchangeRate;
    }

    const commEntry = getCommEntry(trade);
    const netPnl = pnlBaht - commEntry - commExit;

    try {
      await updateDoc(doc(db, "trades", trade.id!), {
        exit,
        commissionExit: commExit,
        status: "closed",
        points: Number(pts.toFixed(4)),
        pnlBaht: Number(pnlBaht.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2))
      });

      Swal.fire({
        icon: netPnl >= 0 ? "success" : "info",
        title: "ปิดสถานะสำเร็จ",
        text: `Net P&L: ${netPnl >= 0 ? "+" : ""}฿${netPnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        timer: 2000,
        showConfirmButton: false
      });

      await fetchDashboardData();
    } catch (error) {
      console.error("Error closing position:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกการปิดสถานะได้", "error");
    }
  };

  const handleSort = (key: keyof TradeRecord | "netPnl") => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const exportCSV = () => {
    if (filteredAndSortedClosed.length === 0) return;
    const headers = ["วันที่", "Asset", "Symbol", "Series", "Side", "Currency", "FX Rate", "Entry", "Exit", "ปริมาณ (Contracts/Units)", "ค่าคอมเข้า", "ค่าคอมออก", "ส่วนต่างราคา", "Net P&L (฿)", "Strategy", "หมายเหตุ"];
    const records = filteredAndSortedClosed.map(t => [
      t.date, t.assetType || "TFEX", t.symbol, t.series || "", t.side,
      t.currency || "THB", t.exchangeRate || 1,
      t.entry, t.exit ?? "",
      t.contracts, getCommEntry(t), getCommExit(t),
      t.points ?? "", t.netPnl ?? "", t.strategy || "",
      `"${(t.notes || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...records.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `tfex_trades_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Derived Stats
  const stats = useMemo(() => {
    let totalNetPnl = 0;
    let winCount = 0;
    let netProfit = 0;
    let netLoss = 0;
    let maxDrawdown = 0;
    let peakEquity = 0;
    let currentEquity = 0;

    const cumulativePnL: number[] = [0];
    const dailyPnLMap: Record<string, number> = {};
    const strategyPnLMap: Record<string, number> = {};
    const symbolPnLMap: Record<string, number> = {};

    trades.forEach(t => {
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

      dailyPnLMap[t.date] = (dailyPnLMap[t.date] || 0) + pnl;

      const strat = t.strategy || 'Unknown';
      strategyPnLMap[strat] = (strategyPnLMap[strat] || 0) + pnl;

      const sym = t.symbol || 'Unknown';
      symbolPnLMap[sym] = (symbolPnLMap[sym] || 0) + pnl;
    });

    const assetAllocationMap: Record<string, number> = {};
    openTrades.forEach(t => {
      const asset = t.assetType || "TFEX";
      const er = t.exchangeRate || 1;
      const value = t.entry * t.contracts * er;
      assetAllocationMap[asset] = (assetAllocationMap[asset] || 0) + value;
    });

    const totalTrades = trades.length;
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
      assetAllocationMap,
      dates: trades.map(t => t.date),
      netPnls: trades.map(t => t.netPnl ?? 0)
    };
  }, [trades, openTrades]);

  // Chart Configurations
  const equityData = {
    labels: Array.from({ length: stats.cumulativePnL.length }, (_, i) => i === 0 ? 'Start' : stats.dates[i-1]),
    datasets: [{
      label: 'Equity (฿)',
      data: stats.cumulativePnL,
      borderColor: '#00d4aa',
      backgroundColor: 'rgba(0, 212, 170, 0.08)',
      borderWidth: 2,
      tension: 0.4,
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
      backgroundColor: dailyLabels.map(d => stats.dailyPnLMap[d] >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(251, 113, 133, 0.7)'),
      borderRadius: 6
    }]
  };

  const strategyLabels = Object.keys(stats.strategyPnLMap).sort((a,b) => stats.strategyPnLMap[b] - stats.strategyPnLMap[a]);
  const strategyData = {
    labels: strategyLabels,
    datasets: [{
      label: 'P&L By Strategy (฿)',
      data: strategyLabels.map(s => stats.strategyPnLMap[s]),
      backgroundColor: strategyLabels.map(s => stats.strategyPnLMap[s] >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(251, 113, 133, 0.7)'),
      borderRadius: 6
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0 } },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, border: { dash: [4, 4] } }
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">TFEX Dashboard</h2>
          <p className="text-textMuted text-sm mt-1">สรุปข้อมูลการลงทุน สายเก็งกำไร TFEX</p>
        </div>
        <select
          className="w-full sm:w-auto !py-2 text-sm"
          value={daysFilter}
          onChange={(e) => setDaysFilter(e.target.value)}
        >
          <option value="all">ทุกช่วงเวลา</option>
          <option value="7">7 วันล่าสุด</option>
          <option value="30">30 วันล่าสุด</option>
          <option value="90">90 วันล่าสุด</option>
        </select>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <StatCard title="กำไร/ขาดทุนสุทธิ" value={`฿${stats.totalNetPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} icon={Wallet} iconColor="#34d399" iconBg="rgba(52,211,153,0.1)" />
        <StatCard title="Win Rate" value={`${stats.winRate.toFixed(1)}%`} icon={Target} iconColor="#60a5fa" iconBg="rgba(96,165,250,0.1)" />
        <StatCard title="จำนวนออเดอร์" value={stats.totalTrades.toString()} icon={BarChart3} iconColor="#a78bfa" iconBg="rgba(167,139,250,0.1)" />
        <StatCard title="Avg P&L / Trade" value={`฿${stats.avgPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} icon={TrendingUp} iconColor="#fbbf24" iconBg="rgba(251,191,36,0.1)" />
        <StatCard title="Max Drawdown" value={`฿${stats.maxDrawdown.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} icon={TrendingDown} iconColor="#fb7185" iconBg="rgba(251,113,133,0.1)" />
        <StatCard title="Profit Factor" value={stats.profitFactor > 99 ? '∞' : stats.profitFactor.toFixed(2)} icon={Trophy} iconColor="#22d3ee" iconBg="rgba(34,211,238,0.1)" />
      </div>

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <div className="card !border-amber-500/15 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse" />
            <h3 className="font-semibold text-sm">Open Positions</h3>
            <span className="text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
              {openTrades.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {openTrades.map(trade => (
              <OpenTradeCard
                key={trade.id}
                trade={trade}
                currentPrices={currentPrices}
                setCurrentPrices={setCurrentPrices}
                multipliers={multipliers}
                handleClosePosition={handleClosePosition}
                handleDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">Equity Curve</h3>
          <div className="h-72 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Line data={equityData} options={chartOptions as any} />
          </div>
        </div>
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">กำไร/ขาดทุนรายวัน</h3>
          <div className="h-72 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Bar data={dailyData} options={chartOptions as any} />
          </div>
        </div>
        <div className="card lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">P&L ตามกลยุทธ์</h3>
          <div className="h-56 w-full">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Bar data={strategyData} options={{...chartOptions, indexAxis: 'y'} as any} />
          </div>
        </div>
      </div>

      {/* Closed Trades Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-5 border-b border-gray-100 dark:border-white/[0.06]">
          <h3 className="font-semibold">ประวัติที่ปิดสถานะแล้ว</h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 text-textMuted/60 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหา..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="!pl-9 !py-2 w-full sm:w-48 text-sm"
              />
            </div>
            <button onClick={exportCSV} className="btn btn-secondary !py-2 text-xs whitespace-nowrap justify-center">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cursor-pointer hover:text-white" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-1.5">วันที่ <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                </th>
                <th>Asset</th>
                <th>Symbol</th>
                <th className="cursor-pointer hover:text-white" onClick={() => handleSort('side')}>
                  <div className="flex items-center gap-1.5">Side <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                </th>
                <th className="text-center">Entry</th>
                <th className="text-center">Exit</th>
                <th className="text-center">Qty</th>
                <th className="text-center">Fee</th>
                <th className="cursor-pointer hover:text-white text-center" onClick={() => handleSort('netPnl')}>
                  <div className="flex items-center justify-center gap-1.5">Net P&L <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                </th>
                <th>Strategy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedClosed.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-textMuted/60 text-sm">ยังไม่มีข้อมูล</td>
                </tr>
              ) : (
                filteredAndSortedClosed.map(trade => (
                  <tr key={trade.id}>
                    <td className="whitespace-nowrap font-mono text-xs text-textMuted">{trade.date}</td>
                    <td>
                      <span className="bg-brand-start/8 text-brand-start px-1.5 py-0.5 rounded text-[10px] font-bold">TFEX</span>
                    </td>
                    <td className="font-semibold text-sm">
                      {trade.symbol}
                      {trade.series && <span className="text-xs text-textMuted/60 ml-1">{trade.series}</span>}
                    </td>
                    <td>
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-[11px] font-bold",
                        (trade.side === "Long" || trade.side === "Buy") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      )}>{trade.side}</span>
                    </td>
                    <td className="text-center font-mono text-xs">{trade.entry}</td>
                    <td className="text-center font-mono text-xs">{trade.exit ?? "—"}</td>
                    <td className="text-center font-mono text-xs text-textMuted">{trade.contracts}</td>
                    <td className="text-center text-xs text-rose-400/60 font-mono">
                      ฿{(getCommEntry(trade) + getCommExit(trade)).toFixed(2)}
                    </td>
                    <td className={clsx(
                      "text-center font-mono text-sm font-semibold",
                      (trade.netPnl ?? 0) > 0 ? "text-emerald-400" : (trade.netPnl ?? 0) < 0 ? "text-rose-400" : "text-textMuted"
                    )}>
                      {(trade.netPnl ?? 0) > 0 ? '+' : ''}{(trade.netPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-xs text-textMuted/60">{trade.strategy || "—"}</td>
                    <td className="text-center">
                      <button
                        onClick={() => trade.id && handleDelete(trade.id)}
                        className="p-1.5 text-textMuted/40 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

/* ── StatCard ── */
function StatCard({ title, value, icon: Icon, iconColor, iconBg }: {
  title: string; value: string; icon: React.ElementType; iconColor: string; iconBg: string;
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
        </div>
      </div>
    </div>
  );
}

/* ── OpenTradeCard ── */
function OpenTradeCard({
  trade, currentPrices, setCurrentPrices, multipliers, handleClosePosition, handleDelete
}: {
  trade: TradeRecord;
  currentPrices: Record<string, string>;
  setCurrentPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  multipliers: Record<string, number>;
  handleClosePosition: (t: TradeRecord) => void;
  handleDelete: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cp = parseFloat(currentPrices[trade.id!] || "");
  let urNet: number | null = null;

  if (!isNaN(cp) && cp > 0) {
    const diff = cp - trade.entry;
    const pts = (trade.side === "Long" || trade.side === "Buy") ? diff : -diff;
    const commEntry = trade.commissionEntry ?? trade.commission ?? 0;

    let pnlBaht = 0;
    if (trade.assetType === "TFEX" || !trade.assetType) {
      const mult = multipliers[trade.symbol] ?? DEFAULT_MULTIPLIERS.Other ?? 1;
      pnlBaht = pts * mult * trade.contracts;
    } else {
      const er = trade.exchangeRate || 1;
      pnlBaht = pts * trade.contracts * er;
    }
    urNet = pnlBaht - commEntry;
  }

  return (
    <div
      className={clsx(
        "rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3.5 transition-all duration-200",
        !isExpanded && "cursor-pointer hover:border-brand-start/30 hover:shadow-glow-sm",
        isExpanded && "space-y-3"
      )}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      <div className="flex items-center gap-2 flex-wrap relative">
        <span className="font-bold text-sm">{trade.symbol}</span>
        {trade.series && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">{trade.series}</span>}
        <span className={clsx(
          "px-1.5 py-0.5 rounded text-[10px] font-bold",
          (trade.side === "Long" || trade.side === "Buy") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
        )}>{trade.side}</span>

        {!isExpanded && (
          <div className="ml-auto text-right">
            {urNet !== null ? (
              <div className={clsx("text-sm font-mono font-bold", urNet > 0 ? "text-emerald-400" : urNet < 0 ? "text-rose-400" : "text-textMuted")}>
                {urNet >= 0 ? "+" : "-"}฿{Math.abs(urNet).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            ) : (
              <div className="text-[10px] font-mono text-textMuted/60">
                {trade.contracts} {(!trade.assetType || trade.assetType === "TFEX") ? "สัญญา" : "ปริมาณ"}
              </div>
            )}
          </div>
        )}

        {isExpanded && (
          <>
            <span className="text-[11px] text-textMuted/60 ml-auto mr-5 font-mono">{trade.date}</span>
            <button
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-textMuted/40 hover:text-white bg-white/[0.06] rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="text-xs text-textMuted/60 flex justify-between px-0.5">
            <span>Entry: <span className="text-white font-mono">{trade.entry}</span></span>
            <span>{trade.contracts} {(!trade.assetType || trade.assetType === "TFEX") ? "สัญญา" : "ปริมาณ"}</span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            <div className="relative flex-1">
              <input
                type="number"
                step="any"
                placeholder="ราคาปัจจุบัน..."
                className="w-full !py-1.5 text-xs rounded-lg !pl-3 !pr-6 !bg-white/[0.03] font-mono"
                value={currentPrices[trade.id!] || ""}
                onChange={e => setCurrentPrices(prev => ({ ...prev, [trade.id!]: e.target.value }))}
                onClick={e => e.stopPropagation()}
              />
              {currentPrices[trade.id!] && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-textMuted/40 hover:text-white rounded-full"
                  onClick={(e) => { e.stopPropagation(); setCurrentPrices(prev => { const n = { ...prev }; delete n[trade.id!]; return n; })}}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className={clsx(
              "text-right text-sm font-mono font-bold min-w-[70px]",
              urNet === null ? "text-textMuted/40" : urNet > 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {urNet === null ? "—" : `${urNet >= 0 ? "+" : "-"}฿${Math.abs(urNet).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={() => handleClosePosition(trade)}
              className="btn btn-primary !py-1.5 !px-3 text-xs flex-1"
            >
              ปิดสถานะ
            </button>
            <button
              onClick={() => trade.id && handleDelete(trade.id)}
              className="p-1.5 text-textMuted/40 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
              title="ลบ"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
