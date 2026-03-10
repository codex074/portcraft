import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { TradeRecord } from "../types";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler, ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import clsx from "clsx";
import { TrendingUp, BarChart3, Calendar, DollarSign, Target, Award, Briefcase } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, ArcElement);

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const MONTH_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { maxRotation: 0, font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.03)' }, border: { dash: [4, 4] } }
  }
} as const;

export default function Performance() {
  const { user } = useAuth();
  const [allTrades, setAllTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString());
  const [usdRate, setUsdRate] = useState<number>(35);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "trades"), where("userId", "==", user.uid)));
        setAllTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })) as TradeRecord[]);
        // fetch exchange rate
        try {
          const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
          const data = await res.json();
          if (data.rates?.THB) setUsdRate(data.rates.THB);
        } catch { /* ignore */ }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [user]);

  const { tfexClosed, investOpen, investClosed, availableYears } = useMemo(() => {
    const tfexClosed = allTrades.filter(t => (!t.assetType || t.assetType === "TFEX") && t.status !== "open")
      .sort((a, b) => a.date.localeCompare(b.date));
    const investOpen = allTrades.filter(t => t.assetType && t.assetType !== "TFEX" && t.status === "open");
    const investClosed = allTrades.filter(t => t.assetType && t.assetType !== "TFEX" && t.status !== "open");
    const years = new Set<string>();
    allTrades.forEach(t => { if (t.date) years.add(t.date.split('-')[0]); });
    return { tfexClosed, investOpen, investClosed, availableYears: Array.from(years).sort().reverse() };
  }, [allTrades]);

  const filteredYearTrades = useMemo(() =>
    yearFilter === "all" ? tfexClosed : tfexClosed.filter(t => t.date.startsWith(yearFilter)),
    [tfexClosed, yearFilter]
  );

  /* ── Cumulative equity (all time) ── */
  const equityCurve = useMemo(() => {
    let cum = 0;
    const labels: string[] = ['เริ่มต้น'];
    const values: number[] = [0];
    tfexClosed.forEach(t => { cum += t.netPnl ?? 0; labels.push(t.date); values.push(cum); });
    return { labels, values };
  }, [tfexClosed]);

  /* ── Monthly P&L for selected year ── */
  const monthlyPnL = useMemo(() => {
    const data = Array(12).fill(0);
    filteredYearTrades.forEach(t => {
      const m = parseInt(t.date.split('-')[1]) - 1;
      data[m] += t.netPnl ?? 0;
    });
    return data;
  }, [filteredYearTrades]);

  /* ── Quarterly data (all years) ── */
  const quarterlyRows = useMemo(() => {
    const map: Record<string, { trades: TradeRecord[]; pnl: number }> = {};
    tfexClosed.forEach(t => {
      const [year, month] = t.date.split('-');
      const q = Math.ceil(parseInt(month) / 3);
      const key = `${year}-Q${q}`;
      if (!map[key]) map[key] = { trades: [], pnl: 0 };
      map[key].trades.push(t);
      map[key].pnl += t.netPnl ?? 0;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).reverse();
  }, [tfexClosed]);

  /* ── Annual P&L ── */
  const annualData = useMemo(() => {
    const map: Record<string, number> = {};
    tfexClosed.forEach(t => {
      const y = t.date.split('-')[0];
      map[y] = (map[y] || 0) + (t.netPnl ?? 0);
    });
    return map;
  }, [tfexClosed]);

  /* ── Portfolio composition (invested) ── */
  const portfolioComp = useMemo(() => {
    const map: Record<string, number> = {};
    investOpen.forEach(t => {
      const type = t.assetType || 'OTHER';
      const val = t.entry * t.contracts * (t.currency === 'USD' ? (t.exchangeRate || usdRate) : 1);
      map[type] = (map[type] || 0) + val;
    });
    return map;
  }, [investOpen, usdRate]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const totalTfexPnl = tfexClosed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const yearTfexPnl = filteredYearTrades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const realizedInvest = investClosed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const totalRealized = totalTfexPnl + realizedInvest;
    const totalInvested = investOpen.reduce((s, t) => s + t.entry * t.contracts * (t.currency === 'USD' ? (t.exchangeRate || usdRate) : 1), 0);
    const tfexWins = tfexClosed.filter(t => (t.netPnl ?? 0) > 0).length;
    const tfexWinRate = tfexClosed.length > 0 ? (tfexWins / tfexClosed.length) * 100 : 0;
    return { totalTfexPnl, yearTfexPnl, realizedInvest, totalRealized, totalInvested, tfexWinRate };
  }, [tfexClosed, filteredYearTrades, investClosed, investOpen, usdRate]);

  const allocLabels = Object.keys(portfolioComp);
  const typeLabel = (t: string) => ({ TH_STOCK: 'หุ้นไทย', US_STOCK: 'หุ้น US', FUND: 'กองทุน', CRYPTO: 'Crypto' }[t] || t);

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
          <h2 className="text-2xl font-bold">Performance Overview</h2>
          <p className="text-textMuted text-sm mt-1">ภาพรวมการเติบโตของพอร์ตการลงทุนทั้งหมด</p>
        </div>
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="w-full sm:w-auto !py-2 text-sm"
        >
          <option value="all">ทุกปี</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <PerfStatCard title="P&L รวมทั้งหมด" value={`${stats.totalRealized >= 0 ? '+' : ''}฿${fmt(stats.totalRealized)}`} positive={stats.totalRealized >= 0} icon={TrendingUp} />
        <PerfStatCard title={`TFEX ปี ${yearFilter === 'all' ? 'ทุกปี' : yearFilter}`} value={`${stats.yearTfexPnl >= 0 ? '+' : ''}฿${fmt(stats.yearTfexPnl)}`} positive={stats.yearTfexPnl >= 0} icon={BarChart3} />
        <PerfStatCard title="TFEX P&L รวม" value={`${stats.totalTfexPnl >= 0 ? '+' : ''}฿${fmt(stats.totalTfexPnl)}`} positive={stats.totalTfexPnl >= 0} icon={Target} />
        <PerfStatCard title="TFEX Win Rate" value={`${stats.tfexWinRate.toFixed(1)}%`} positive={stats.tfexWinRate >= 50} icon={Award} />
        <PerfStatCard title="Realized (หุ้น/กองทุน)" value={`${stats.realizedInvest >= 0 ? '+' : ''}฿${fmt(stats.realizedInvest)}`} positive={stats.realizedInvest >= 0} icon={DollarSign} />
        <PerfStatCard title="มูลค่าที่ถือครอง" value={`฿${fmt(stats.totalInvested)}`} positive={true} neutral icon={Briefcase} />
      </div>

      {/* Chart Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMuted">Equity Curve – TFEX (สะสมทั้งหมด)</h3>
            <span className={clsx(
              "text-sm font-mono font-bold",
              stats.totalTfexPnl >= 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {stats.totalTfexPnl >= 0 ? '+' : ''}฿{fmt(stats.totalTfexPnl)}
            </span>
          </div>
          <div className="h-56 w-full">
            <Line
              data={{
                labels: equityCurve.labels,
                datasets: [{
                  label: 'Cumulative P&L (฿)',
                  data: equityCurve.values,
                  borderColor: '#00d4aa',
                  backgroundColor: 'rgba(0,212,170,0.07)',
                  borderWidth: 2, tension: 0.4, fill: true, pointRadius: 0, pointHoverRadius: 4
                }]
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              options={CHART_OPTS as any}
            />
          </div>
        </div>

        {/* Portfolio Allocation */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">สัดส่วนพอร์ต (ต้นทุน)</h3>
          <div className="h-48 flex items-center justify-center">
            {allocLabels.length > 0 ? (
              <Doughnut
                data={{
                  labels: allocLabels.map(typeLabel),
                  datasets: [{
                    data: allocLabels.map(k => portfolioComp[k]),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981'],
                    borderWidth: 0, hoverOffset: 4
                  }]
                }}
                options={{
                  maintainAspectRatio: false, cutout: '72%',
                  plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 10 } } },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ฿${fmt(ctx.parsed, 0)}` } }
                  }
                }}
              />
            ) : (
              <div className="text-textMuted/30 text-sm text-center">ไม่มีสินทรัพย์ที่ถือครอง</div>
            )}
          </div>
          {allocLabels.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
              {allocLabels.map(k => (
                <div key={k} className="flex justify-between text-xs px-1">
                  <span className="text-textMuted/60">{typeLabel(k)}</span>
                  <span className="font-mono">฿{fmt(portfolioComp[k], 0)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs px-1 pt-1 border-t border-white/[0.04]">
                <span className="font-semibold text-textMuted/70">รวม</span>
                <span className="font-mono font-semibold">฿{fmt(Object.values(portfolioComp).reduce((s, v) => s + v, 0), 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly P&L */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">
            P&L รายเดือน – TFEX ({yearFilter === 'all' ? 'ทุกปี (ปีล่าสุด)' : `ปี ${yearFilter}`})
          </h3>
          <div className="h-52 w-full">
            <Bar
              data={{
                labels: MONTH_NAMES,
                datasets: [{
                  label: 'Monthly P&L',
                  data: monthlyPnL,
                  backgroundColor: monthlyPnL.map(v => v >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(251,113,133,0.7)'),
                  borderRadius: 5
                }]
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              options={CHART_OPTS as any}
            />
          </div>
        </div>

        {/* Annual P&L */}
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-textMuted">P&L รายปี – TFEX</h3>
          <div className="h-52 w-full">
            {Object.keys(annualData).length > 0 ? (
              <Bar
                data={{
                  labels: Object.keys(annualData).sort(),
                  datasets: [{
                    label: 'Annual P&L',
                    data: Object.keys(annualData).sort().map(y => annualData[y]),
                    backgroundColor: Object.keys(annualData).sort().map(y => annualData[y] >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(251,113,133,0.7)'),
                    borderRadius: 7
                  }]
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options={CHART_OPTS as any}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-textMuted/30 text-sm">ยังไม่มีข้อมูล</div>
            )}
          </div>
        </div>
      </div>

      {/* Quarterly Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-3">
          <Calendar className="w-4 h-4 text-brand-start" />
          <h3 className="font-semibold text-sm">สรุป P&L รายไตรมาส – TFEX</h3>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ไตรมาส</th>
                <th className="text-center">จำนวนออเดอร์</th>
                <th className="text-center">Win Rate</th>
                <th className="text-center">Avg P&L/Trade</th>
                <th className="text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {quarterlyRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-textMuted/40 text-sm">ยังไม่มีข้อมูล</td></tr>
              ) : (
                quarterlyRows.map(([key, { trades, pnl }]) => {
                  const wins = trades.filter(t => (t.netPnl ?? 0) > 0).length;
                  const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;
                  const avg = trades.length > 0 ? pnl / trades.length : 0;
                  return (
                    <tr key={key}>
                      <td className="font-semibold">{key}</td>
                      <td className="text-center text-textMuted/60">{trades.length}</td>
                      <td className="text-center">
                        <span className={clsx("text-xs font-mono", wr >= 50 ? "text-emerald-400" : "text-rose-400")}>
                          {wr.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={clsx("text-xs font-mono", avg >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {avg >= 0 ? '+' : ''}฿{fmt(avg, 0)}
                        </span>
                      </td>
                      <td className={clsx(
                        "text-right font-mono font-semibold",
                        pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-textMuted"
                      )}>
                        {pnl >= 0 ? '+' : ''}฿{fmt(pnl)}
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

/* ── Stat Card ── */
function PerfStatCard({ title, value, positive, neutral, icon: Icon }: {
  title: string; value: string; positive: boolean; neutral?: boolean; icon: React.ElementType;
}) {
  const color = neutral ? '#60a5fa' : positive ? '#34d399' : '#fb7185';
  const bg = neutral ? 'rgba(96,165,250,0.06)' : positive ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.06)';
  const iconBg = neutral ? 'rgba(96,165,250,0.1)' : positive ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.1)';
  return (
    <div className="card !p-4" style={{ background: bg }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-textMuted/70 uppercase tracking-wider truncate">{title}</div>
          <div className="text-base font-bold font-mono mt-0.5 truncate" style={{ color }}>{value}</div>
        </div>
      </div>
    </div>
  );
}
