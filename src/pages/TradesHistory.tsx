import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { DEFAULT_MULTIPLIERS } from "../lib/constants";
import type { TradeRecord } from "../types";
import Swal from "sweetalert2";
import { ArrowUpDown, Download, Trash2, Search, X } from "lucide-react";
import clsx from "clsx";

// Helper: get commission entry (backward-compat with legacy `commission` field)
const getCommEntry = (t: TradeRecord) => t.commissionEntry ?? t.commission ?? 0;
const getCommExit = (t: TradeRecord) => t.commissionExit ?? 0;

export default function TradesHistory() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [multipliers, setMultipliers] = useState<Record<string, number>>(DEFAULT_MULTIPLIERS);
  // Current price inputs for unrealized P&L: keyed by trade id
  const [currentPrices, setCurrentPrices] = useState<Record<string, string>>({});

  const [sortConfig, setSortConfig] = useState<{
    key: keyof TradeRecord;
    direction: "asc" | "desc";
  }>({ key: "date", direction: "desc" });

  const fetchTrades = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "trades"),
        where("userId", "==", user.uid)
      );
      const querySnapshot = await getDocs(q);
      const tradesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TradeRecord[];
      setTrades(tradesData);
    } catch (error) {
      console.error("Error fetching trades: ", error);
      Swal.fire({
        icon: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        text: "ไม่สามารถดึงข้อมูลประวัติการเทรดได้",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Split trades into open and closed
  const openTrades = useMemo(() =>
    trades.filter(t => t.status === "open")
      .sort((a, b) => b.date < a.date ? -1 : 1),
    [trades]
  );
  const closedTrades = useMemo(() =>
    trades.filter(t => t.status !== "open"),
    [trades]
  );

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
        setTrades(prev => prev.filter(t => t.id !== id));
        Swal.fire({ icon: "success", title: "ลบสำเร็จ", showConfirmButton: false, timer: 1500 });
      } catch (error) {
        console.error("Error deleting trade:", error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถลบข้อมูลได้", "error");
      }
    }
  };

  const handleClosePosition = async (trade: TradeRecord) => {
    const multiplier = multipliers[trade.symbol] || DEFAULT_MULTIPLIERS.Other;

    const { value: formValues } = await Swal.fire({
      title: `ปิดสัญญา ${trade.symbol}${trade.series ? ` ${trade.series}` : ""}`,
      html: `
        <div style="text-align:left; margin-bottom:8px; font-size:0.85rem; color:#9aa0a6">
          Entry: <b>${trade.entry}</b> &nbsp;|&nbsp; ${trade.side} &nbsp;|&nbsp; ${trade.contracts} สัญญา
        </div>
        <input id="swal-exit" class="swal2-input" type="number" step="any" placeholder="ราคาออก (Exit) *" autofocus>
        <input id="swal-comm" class="swal2-input" type="number" step="any" placeholder="ค่าคอม ปิดสัญญา (฿)" value="0">
      `,
      showCancelButton: true,
      confirmButtonText: "ยืนยันปิดสัญญา",
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
    const pts = trade.side === "Long" ? pointDiff : -pointDiff;
    const pnlBaht = pts * multiplier * trade.contracts;
    const commEntry = getCommEntry(trade);
    const netPnl = pnlBaht - commEntry - commExit;

    try {
      await updateDoc(doc(db, "trades", trade.id!), {
        exit,
        commissionExit: commExit,
        status: "closed",
        points: Number(pts.toFixed(2)),
        pnlBaht: Number(pnlBaht.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2))
      });

      Swal.fire({
        icon: netPnl >= 0 ? "success" : "info",
        title: "ปิดสัญญาสำเร็จ",
        text: `Net P&L: ${netPnl >= 0 ? "+" : ""}฿${netPnl.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        timer: 2000,
        showConfirmButton: false
      });

      await fetchTrades();
    } catch (error) {
      console.error("Error closing position:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกการปิดสัญญาได้", "error");
    }
  };

  const handleSort = (key: keyof TradeRecord) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const filteredAndSortedClosed = useMemo(() => {
    let result = closedTrades;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(term) ||
        t.series?.toLowerCase().includes(term) ||
        t.strategy?.toLowerCase().includes(term) ||
        t.notes?.toLowerCase().includes(term) ||
        t.date.includes(term)
      );
    }

    return [...result].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [closedTrades, searchTerm, sortConfig]);

  // Compute unrealized P&L for an open trade given current price
  const getUnrealizedPnl = (trade: TradeRecord, currentPriceStr: string) => {
    const cp = parseFloat(currentPriceStr);
    if (!cp || isNaN(cp)) return null;
    const mult = multipliers[trade.symbol] || DEFAULT_MULTIPLIERS.Other;
    const diff = cp - trade.entry;
    const pts = trade.side === "Long" ? diff : -diff;
    const pnl = pts * mult * trade.contracts;
    const net = pnl - getCommEntry(trade);
    return { pts, pnl, net };
  };

  const exportCSV = () => {
    if (filteredAndSortedClosed.length === 0) return;
    const headers = ["วันที่", "Symbol", "Series", "Side", "Entry", "Exit", "จำนวนสัญญา", "ค่าคอมเปิด", "ค่าคอมปิด", "P&L (จุด)", "Net P&L (฿)", "Strategy", "หมายเหตุ"];
    const records = filteredAndSortedClosed.map(t => [
      t.date, t.symbol, t.series || "", t.side, t.entry, t.exit ?? "",
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">ประวัติการเทรด</h2>
          <p className="text-textMuted text-sm mt-1">รายการเทรดทั้งหมดของคุณ</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 w-full md:w-64 rounded-xl"
            />
          </div>
          <button onClick={exportCSV} className="btn btn-outline py-2 whitespace-nowrap">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Open Positions ── */}
      {loading ? null : openTrades.length > 0 && (
        <div className="card space-y-4 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse"></div>
            <h3 className="font-semibold text-lg">สัญญาที่เปิดอยู่</h3>
            <span className="text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {openTrades.length} รายการ
            </span>
          </div>

          <div className="space-y-3">
            {openTrades.map(trade => {
              const urPnl = getUnrealizedPnl(trade, currentPrices[trade.id!] || "");
              return (
                <div key={trade.id} className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-surfaceLight/50 p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Trade info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">{trade.symbol}</span>
                        {trade.series && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{trade.series}</span>}
                        <span className={clsx(
                          "px-2 py-0.5 rounded-md text-xs font-bold",
                          trade.side === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>{trade.side}</span>
                        <span className="text-xs text-textMuted">{trade.date}</span>
                      </div>
                      <div className="flex gap-4 text-sm text-textMuted flex-wrap">
                        <span>Entry: <span className="text-gray-900 dark:text-white font-mono">{trade.entry}</span></span>
                        <span>สัญญา: <span className="text-gray-900 dark:text-white font-mono">{trade.contracts}</span></span>
                        <span>ค่าคอมเปิด: <span className="text-rose-400 font-mono">฿{getCommEntry(trade).toFixed(2)}</span></span>
                      </div>
                    </div>

                    {/* Unrealized P&L input */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="space-y-1">
                        <label className="text-xs text-textMuted">ราคาตลาดปัจจุบัน</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            placeholder="ใส่ราคาเพื่อดู Unrealized"
                            className="pr-7 py-1.5 text-sm w-52 rounded-lg"
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
                      </div>

                      {/* Unrealized P&L display */}
                      {urPnl !== null ? (
                        <div className={clsx(
                          "text-right p-2 rounded-lg border min-w-[90px]",
                          urPnl.net > 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
                        )}>
                          <div className="text-xs text-textMuted">Unrealized</div>
                          <div className={clsx("font-mono font-bold text-base", urPnl.net > 0 ? "text-emerald-400" : "text-rose-400")}>
                            {urPnl.net > 0 ? "+" : ""}{urPnl.net >= 0 ? "" : "-"}฿{Math.abs(urPnl.net).toLocaleString("en-US", { minimumFractionDigits: 0 })}
                          </div>
                          <div className={clsx("text-xs font-mono", urPnl.pts > 0 ? "text-emerald-400/70" : "text-rose-400/70")}>
                            {urPnl.pts > 0 ? "+" : ""}{urPnl.pts.toFixed(1)} จุด
                          </div>
                        </div>
                      ) : (
                        <div className="text-right p-2 rounded-lg border border-gray-200 dark:border-white/8 min-w-[90px]">
                          <div className="text-xs text-textMuted">Unrealized</div>
                          <div className="font-mono text-textMuted text-sm">—</div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-center">
                      <button
                        onClick={() => handleClosePosition(trade)}
                        className="btn btn-primary py-1.5 px-3 text-sm"
                      >
                        ปิดสัญญา
                      </button>
                      <button
                        onClick={() => trade.id && handleDelete(trade.id)}
                        className="p-1.5 text-textMuted hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Closed Trades Table ── */}
      <div className="card overflow-hidden !p-0">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-white/5 flex items-center gap-2">
          <h3 className="font-semibold">สัญญาที่ปิดแล้ว</h3>
          {!loading && <span className="text-xs text-textMuted">({filteredAndSortedClosed.length} รายการ)</span>}
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead className="bg-surfaceLight/50">
              <tr>
                <th className="cursor-pointer hover:text-gray-900 dark:hover:text-white" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-2">วันที่ <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th>Symbol</th>
                <th>Series</th>
                <th className="cursor-pointer hover:text-gray-900 dark:hover:text-white" onClick={() => handleSort('side')}>
                  <div className="flex items-center gap-2">Side <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="text-center">Entry</th>
                <th className="text-center">Exit</th>
                <th className="text-center">สัญญา</th>
                <th className="text-center text-textMuted">ค่าคอมรวม</th>
                <th className="cursor-pointer hover:text-gray-900 dark:hover:text-white text-center" onClick={() => handleSort('netPnl')}>
                  <div className="flex items-center justify-center gap-2">Net P&L <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th>Strategy</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-textMuted">
                    <div className="w-6 h-6 border-2 border-brand-start border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : filteredAndSortedClosed.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-textMuted empty-state">ยังไม่มีข้อมูล</td>
                </tr>
              ) : (
                filteredAndSortedClosed.map(trade => (
                  <tr key={trade.id} className="group">
                    <td className="whitespace-nowrap font-mono text-sm">{trade.date}</td>
                    <td className="font-semibold">{trade.symbol}</td>
                    <td className="text-sm text-textMuted">{trade.series || "—"}</td>
                    <td>
                      <span className={clsx(
                        "px-2 py-1 rounded-md text-xs font-semibold",
                        trade.side === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      )}>{trade.side}</span>
                    </td>
                    <td className="text-center font-mono">{trade.entry}</td>
                    <td className="text-center font-mono">{trade.exit ?? "—"}</td>
                    <td className="text-center text-textMuted">{trade.contracts}</td>
                    <td className="text-center text-sm text-rose-400/80 font-mono">
                      ฿{(getCommEntry(trade) + getCommExit(trade)).toFixed(2)}
                    </td>
                    <td className={clsx(
                      "text-center font-mono font-medium",
                      (trade.netPnl ?? 0) > 0 ? "text-emerald-400" : (trade.netPnl ?? 0) < 0 ? "text-rose-400" : "text-textMuted"
                    )}>
                      {(trade.netPnl ?? 0) > 0 ? '+' : ''}{(trade.netPnl ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-xs text-textMuted">{trade.strategy || "—"}</td>
                    <td className="text-center">
                      <button
                        onClick={() => trade.id && handleDelete(trade.id)}
                        className="p-1.5 text-textMuted hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
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
