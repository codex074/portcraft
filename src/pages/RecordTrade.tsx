import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { DEFAULT_MULTIPLIERS } from "../lib/constants";
import Swal from "sweetalert2";
import { ArrowUpRight, ArrowDownRight, RotateCcw, Save, CalendarDays, ChartCandlestick, Hash, TrendingUp, StickyNote } from "lucide-react";
import clsx from "clsx";

/* ── Section header component ── */
function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md bg-brand-start/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-brand-start" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-widest text-textMuted">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-white/5"></div>
    </div>
  );
}

export default function RecordTrade() {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    symbol: "",
    series: "",
    side: "Long" as "Long" | "Short",
    entry: "",
    exit: "",
    contracts: "1",
    commissionEntry: "0",
    commissionExit: "0",
    strategy: "",
    notes: ""
  });

  const [multipliers, setMultipliers] = useState<Record<string, number>>(DEFAULT_MULTIPLIERS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Derived values ── */
  const isOpen = !formData.exit;
  const entryPrice = parseFloat(formData.entry) || 0;
  const exitPrice = parseFloat(formData.exit) || 0;
  const contracts = parseInt(formData.contracts) || 1;
  const commissionEntry = parseFloat(formData.commissionEntry) || 0;
  const commissionExit = parseFloat(formData.commissionExit) || 0;
  const totalCommission = commissionEntry + (isOpen ? 0 : commissionExit);

  const pointDiff = exitPrice - entryPrice;
  const points = formData.side === 'Long' ? pointDiff : -pointDiff;
  const multiplier = multipliers[formData.symbol] || DEFAULT_MULTIPLIERS.Other;
  const pnlBaht = points * multiplier * contracts;
  const netPnl = pnlBaht - totalCommission;

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, "user_settings", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().multipliers) {
          setMultipliers(prev => ({ ...prev, ...docSnap.data().multipliers }));
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };
    fetchSettings();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.symbol || !formData.entry) {
      Swal.fire({ icon: "error", title: "ข้อมูลไม่ครบถ้วน", text: "กรุณากรอก Symbol และราคาเข้า" });
      return;
    }

    setIsSubmitting(true);
    try {
      const status = isOpen ? "open" : "closed";
      const baseData = {
        userId: user.uid,
        date: formData.date,
        symbol: formData.symbol,
        series: formData.series,
        side: formData.side,
        entry: parseFloat(formData.entry),
        contracts,
        commissionEntry,
        commissionExit: isOpen ? 0 : commissionExit,
        strategy: formData.strategy,
        notes: formData.notes,
        status,
        createdAt: serverTimestamp()
      };

      const closedExtra = isOpen ? {} : {
        exit: exitPrice,
        points: Number(points.toFixed(2)),
        pnlBaht: Number(pnlBaht.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2))
      };

      await addDoc(collection(db, "trades"), { ...baseData, ...closedExtra });

      Swal.fire({
        icon: "success",
        title: isOpen ? "บันทึก Open Position สำเร็จ" : "บันทึกสำเร็จ",
        text: isOpen
          ? "สามารถปิดสัญญาได้ในหน้าประวัติการเทรด"
          : "บันทึกข้อมูลการเทรดเรียบร้อยแล้ว",
        timer: 2000,
        showConfirmButton: false
      });

      setFormData(prev => ({
        ...prev,
        symbol: "", series: "", entry: "", exit: "",
        contracts: "1", commissionEntry: "0", commissionExit: "0",
        strategy: "", notes: ""
      }));

    } catch (error) {
      console.error("Error saving trade:", error);
      Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่สามารถบันทึกข้อมูลได้" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const resetForm = () => setFormData(prev => ({
    ...prev,
    symbol: "", series: "", entry: "", exit: "",
    contracts: "1", commissionEntry: "0", commissionExit: "0",
    strategy: "", notes: ""
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold">บันทึกการเทรด</h2>
        <p className="text-textMuted text-sm mt-1">เพิ่มข้อมูลการเทรดใหม่ของคุณ</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ─── Form ─── */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="card !p-0 overflow-hidden divide-y divide-gray-200 dark:divide-white/5">

            {/* ── Section 1: ข้อมูลสัญญา ── */}
            <div className="p-6 space-y-5">
              <SectionLabel icon={CalendarDays} label="ข้อมูลสัญญา" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="form-group">
                  <label htmlFor="date">วันที่ <span className="required">*</span></label>
                  <input type="date" id="date" value={formData.date} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="symbol">Symbol <span className="required">*</span></label>
                  <select id="symbol" value={formData.symbol} onChange={handleChange} required>
                    <option value="">เลือก Symbol</option>
                    <option value="S50">S50 – SET50 Index</option>
                    <option value="GF">GF – Gold Futures</option>
                    <option value="GFM">GFM – Gold-D</option>
                    <option value="SIF">SIF – Single Stock</option>
                    <option value="DW">DW</option>
                    <option value="Other">อื่นๆ</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="series">Series</label>
                  <input type="text" id="series" placeholder="เช่น M26, H26" value={formData.series} onChange={handleChange} list="seriesList" />
                  <datalist id="seriesList">
                    <option value="H26" /><option value="M26" />
                    <option value="U26" /><option value="Z26" /><option value="H27" />
                  </datalist>
                </div>
              </div>

              {/* Side toggle */}
              <div className="form-group">
                <label>Side <span className="required">*</span></label>
                <div className="flex bg-gray-100 dark:bg-surface rounded-xl p-1 gap-1 border border-gray-200 dark:border-white/5">
                  {(["Long", "Short"] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, side: s }))}
                      className={clsx(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all duration-300",
                        formData.side === s
                          ? s === "Long"
                            ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] outline outline-1 outline-emerald-500/30"
                            : "bg-rose-500/20 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)] outline outline-1 outline-rose-500/30"
                          : "text-textMuted hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5"
                      )}
                    >
                      {s === "Long" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Section 2: ราคา & ปริมาณ ── */}
            <div className="p-6 space-y-5">
              <SectionLabel icon={ChartCandlestick} label="ราคา & ปริมาณ" />

              {/* Entry / Exit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="entry">ราคาเข้า (Entry) <span className="required">*</span></label>
                  <input type="number" id="entry" step="any" placeholder="0.00" value={formData.entry} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="exit" className="flex items-center justify-between gap-2">
                    <span>ราคาออก (Exit)</span>
                    <span className={clsx(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
                      isOpen
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    )}>
                      {isOpen ? "OPEN" : "CLOSED"}
                    </span>
                  </label>
                  <input type="number" id="exit" step="any" placeholder="ปล่อยว่าง = Open Position" value={formData.exit} onChange={handleChange} />
                </div>
              </div>

              {/* Contracts + Commission */}
              <div className={clsx("grid grid-cols-1 gap-4", isOpen ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                <div className="form-group">
                  <label htmlFor="contracts">
                    <Hash className="w-3.5 h-3.5 inline-block mr-1 opacity-60" />
                    จำนวนสัญญา <span className="required">*</span>
                  </label>
                  <input type="number" id="contracts" min="1" value={formData.contracts} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="commissionEntry">ค่าคอม เปิด (฿)</label>
                  <input type="number" id="commissionEntry" step="any" placeholder="0" value={formData.commissionEntry} onChange={handleChange} />
                </div>
                {!isOpen && (
                  <div className="form-group">
                    <label htmlFor="commissionExit">ค่าคอม ปิด (฿)</label>
                    <input type="number" id="commissionExit" step="any" placeholder="0" value={formData.commissionExit} onChange={handleChange} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 3: บันทึก ── */}
            <div className="p-6 space-y-5">
              <SectionLabel icon={StickyNote} label="บันทึก" />

              <div className="form-group">
                <label htmlFor="strategy">Strategy</label>
                <input type="text" id="strategy" placeholder="เช่น Breakout, Trend Follow, Scalping…" value={formData.strategy} onChange={handleChange} list="strategyList" />
                <datalist id="strategyList">
                  <option value="Breakout" /><option value="Trend Follow" />
                  <option value="Mean Reversion" /><option value="Scalping" />
                  <option value="Swing" /><option value="News Trading" />
                </datalist>
              </div>

              <div className="form-group">
                <label htmlFor="notes">บันทึกเพิ่มเติม</label>
                <textarea id="notes" rows={3} placeholder="จดบันทึกเกี่ยวกับการเทรดนี้…" value={formData.notes} onChange={handleChange} />
              </div>
            </div>

            {/* ── Footer Buttons ── */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-surface/50 flex gap-3">
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                <RotateCcw className="w-4 h-4" /> ล้างฟอร์ม
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>
                <Save className="w-4 h-4" />
                {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกการเทรด'}
              </button>
            </div>
          </form>
        </div>

        {/* ─── P&L Preview ─── */}
        <div className="lg:col-span-1">
          <div className="card sticky top-24 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-white/5">
              <TrendingUp className="w-4 h-4 text-brand-start" />
              <h3 className="font-semibold">P&L Preview</h3>
              <span className={clsx(
                "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border",
                isOpen
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                  : formData.entry
                    ? "bg-brand-start/10 text-brand-start border-brand-start/20"
                    : "bg-gray-100 dark:bg-white/5 text-textMuted border-gray-200 dark:border-white/5"
              )}>
                {isOpen ? (formData.entry ? "OPEN" : "—") : "CLOSED"}
              </span>
            </div>

            {isOpen ? (
              /* Open position */
              <div className="space-y-3">
                <div className="flex items-center justify-center py-8 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <div className="text-center space-y-2">
                    <div className="text-3xl">📂</div>
                    <p className="text-amber-400 font-semibold text-sm">Open Position</p>
                    <p className="text-textMuted text-xs">กรอกราคา Exit เพื่อคำนวณ P&L</p>
                  </div>
                </div>
                {commissionEntry > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-surfaceLight border border-gray-200 dark:border-white/5 text-sm">
                    <span className="text-textMuted">ค่าคอมเปิด</span>
                    <span className="font-mono text-rose-400">−฿{commissionEntry.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Closed position */
              <div className="space-y-3">
                <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-surfaceLight border border-gray-200 dark:border-white/5 text-sm">
                  <span className="text-textMuted">P&L (จุด)</span>
                  <span className={clsx("font-mono font-medium",
                    points > 0 ? "text-emerald-400" : points < 0 ? "text-rose-400" : "text-gray-900 dark:text-white"
                  )}>
                    {points > 0 ? '+' : ''}{points.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-surfaceLight border border-gray-200 dark:border-white/5 text-sm">
                  <span className="text-textMuted">P&L (บาท)</span>
                  <span className={clsx("font-mono font-medium",
                    pnlBaht > 0 ? "text-emerald-400" : pnlBaht < 0 ? "text-rose-400" : "text-gray-900 dark:text-white"
                  )}>
                    {pnlBaht >= 0 ? '+' : '−'}฿{Math.abs(pnlBaht).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {totalCommission > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-surfaceLight border border-gray-200 dark:border-white/5 text-sm">
                    <div>
                      <div className="text-textMuted">ค่าคอมรวม</div>
                      <div className="text-[10px] text-textMuted/70">
                        เปิด ฿{commissionEntry.toFixed(0)} + ปิด ฿{commissionExit.toFixed(0)}
                      </div>
                    </div>
                    <span className="font-mono text-rose-400">−฿{totalCommission.toFixed(2)}</span>
                  </div>
                )}

                {/* Net P&L — big card */}
                <div className={clsx(
                  "relative overflow-hidden px-4 py-5 rounded-xl border",
                  netPnl > 0 ? "bg-emerald-500/10 border-emerald-500/20" : netPnl < 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-gray-100 dark:bg-surfaceLight border-gray-200 dark:border-white/10"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 dark:text-white/80 font-semibold text-sm">Net P&L</span>
                    <span className={clsx(
                      "font-mono font-bold text-2xl",
                      netPnl > 0 ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                        : netPnl < 0 ? "text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.4)]"
                        : "text-gray-900 dark:text-white"
                    )}>
                      {netPnl > 0 ? '+' : netPnl < 0 ? '−' : ''}฿{Math.abs(netPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Multiplier info */}
            {formData.symbol && (
              <div className="flex items-center justify-between text-xs text-textMuted bg-gray-100 dark:bg-white/5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/5">
                <span>ตัวคูณ {formData.symbol}</span>
                <span className="font-mono font-semibold text-gray-900 dark:text-white">{multiplier} ฿/จุด</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
