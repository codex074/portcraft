import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { DEFAULT_MULTIPLIERS } from "../lib/constants";
import type { AssetType } from "../types";
import Swal from "sweetalert2";
import { ArrowUpRight, ArrowDownRight, RotateCcw, Save, CalendarDays, ChartCandlestick, Hash, TrendingUp, StickyNote, Wallet, RefreshCw } from "lucide-react";
import clsx from "clsx";

const EXCHANGE_RATE_API = "https://api.exchangerate-api.com/v4/latest/USD";

/* ── Section header ── */
function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,212,170,0.08)' }}>
        <Icon className="w-3.5 h-3.5 text-brand-start" />
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-widest text-textMuted/70">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
    </div>
  );
}

export default function RecordTrade() {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    assetType: "TFEX" as AssetType,
    date: new Date().toISOString().split('T')[0],
    symbol: "",
    series: "",
    side: "Long" as "Long" | "Short" | "Buy" | "Sell",
    currency: "THB",
    exchangeRate: "1",
    entry: "",
    exit: "",
    contracts: "1",
    commissionEntry: "0",
    commissionExit: "0",
    strategy: "",
    notes: ""
  });

  // Crypto total-value input mode
  const [cryptoTotalEntry, setCryptoTotalEntry] = useState("");

  const [multipliers, setMultipliers] = useState<Record<string, number>>(DEFAULT_MULTIPLIERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoRate, setAutoRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const fetchExchangeRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch(EXCHANGE_RATE_API);
      const data = await res.json();
      const thbRate = data.rates?.THB;
      if (thbRate) {
        setAutoRate(thbRate);
        return thbRate as number;
      }
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
    } finally {
      setRateLoading(false);
    }
    return null;
  }, []);

  useEffect(() => { fetchExchangeRate(); }, [fetchExchangeRate]);

  /* ── Derived values ── */
  const isOpen = !formData.exit;
  // For CRYPTO: use total-value computed entry price if cryptoTotalEntry is set
  const computedEntryFromTotal = formData.assetType === "CRYPTO" && cryptoTotalEntry
    ? (parseFloat(cryptoTotalEntry) || 0) / Math.max(parseFloat(formData.contracts) || 1, 0.000001)
    : null;
  const entryPrice = computedEntryFromTotal !== null ? computedEntryFromTotal : parseFloat(formData.entry) || 0;
  const exitPrice = parseFloat(formData.exit) || 0;
  const contracts = parseFloat(formData.contracts) || 1;
  const commissionEntry = parseFloat(formData.commissionEntry) || 0;
  const commissionExit = parseFloat(formData.commissionExit) || 0;
  const exchangeRate = parseFloat(formData.exchangeRate) || 1;
  const isUSD = formData.currency !== "THB";
  // Commission in THB: for USD assets multiply by exchange rate
  const totalCommissionTHB = isUSD
    ? (commissionEntry + (isOpen ? 0 : commissionExit)) * exchangeRate
    : commissionEntry + (isOpen ? 0 : commissionExit);

  const pointDiff = exitPrice - entryPrice;
  const points = (formData.side === 'Long' || formData.side === 'Buy') ? pointDiff : -pointDiff;

  let pnlBaht = 0;
  let multiplier = 1;

  if (formData.assetType === "TFEX") {
    multiplier = multipliers[formData.symbol] || DEFAULT_MULTIPLIERS.Other || 1;
    pnlBaht = points * multiplier * contracts;
  } else {
    pnlBaht = points * contracts * exchangeRate;
  }

  const netPnl = pnlBaht - totalCommissionTHB;

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

    const hasEntry = formData.assetType === "CRYPTO" && cryptoTotalEntry
      ? parseFloat(cryptoTotalEntry) > 0
      : !!formData.entry;

    if (!formData.symbol || !hasEntry) {
      Swal.fire({ icon: "error", title: "ข้อมูลไม่ครบถ้วน", text: "กรุณากรอก Symbol และราคาเข้า (หรือมูลค่ารวม)" });
      return;
    }

    setIsSubmitting(true);
    try {
      const status = isOpen ? "open" : "closed";
      const baseData = {
        userId: user.uid,
        assetType: formData.assetType,
        currency: formData.currency,
        exchangeRate: exchangeRate,
        date: formData.date,
        symbol: formData.symbol,
        series: formData.series,
        side: formData.side,
        entry: entryPrice, // uses computed entry if CRYPTO total-value mode
        contracts,
        commissionEntry,         // stored in native currency (USD for US_STOCK/CRYPTO with USD)
        commissionExit: isOpen ? 0 : commissionExit,
        strategy: formData.strategy,
        notes: formData.notes,
        status,
        createdAt: serverTimestamp()
      };

      const closedExtra = isOpen ? {} : {
        exit: exitPrice,
        points: Number(points.toFixed(4)),
        pnlBaht: Number(pnlBaht.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2))  // always in THB
      };

      await addDoc(collection(db, "trades"), { ...baseData, ...closedExtra });

      Swal.fire({
        icon: "success",
        title: isOpen ? "บันทึก Open Position สำเร็จ" : "บันทึกสำเร็จ",
        text: isOpen
          ? "สามารถปิดสถานะได้ในหน้าประวัติ"
          : "บันทึกข้อมูลเรียบร้อยแล้ว",
        timer: 2000,
        showConfirmButton: false
      });

      setCryptoTotalEntry("");
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

  const handleAssetTypeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const assetType = e.target.value as AssetType;
    let nextSide = formData.side;
    let nextCurrency = formData.currency;
    let nextExchangeRate = formData.exchangeRate;

    if (assetType === "TFEX") {
      if (nextSide === "Buy") nextSide = "Long";
      if (nextSide === "Sell") nextSide = "Short";
      nextCurrency = "THB";
      nextExchangeRate = "1";
    } else {
      if (nextSide === "Long") nextSide = "Buy";
      if (nextSide === "Short") nextSide = "Sell";

      if (assetType === "US_STOCK" || assetType === "CRYPTO") {
        nextCurrency = "USD";
        if (autoRate) {
          nextExchangeRate = autoRate.toFixed(4);
        } else {
          const rate = await fetchExchangeRate();
          nextExchangeRate = rate ? rate.toFixed(4) : "";
        }
      } else {
        nextCurrency = "THB";
        nextExchangeRate = "1";
      }
    }

    setCryptoTotalEntry("");
    setFormData(prev => ({
      ...prev,
      assetType,
      side: nextSide,
      currency: nextCurrency,
      exchangeRate: nextExchangeRate,
      symbol: "",
      series: "",
      entry: "",
    }));
  };

  const resetForm = () => {
    setCryptoTotalEntry("");
    setFormData({
      assetType: "TFEX",
      date: new Date().toISOString().split('T')[0],
      symbol: "",
      series: "",
      side: "Long",
      currency: "THB",
      exchangeRate: "1",
      entry: "",
      exit: "",
      contracts: "1",
      commissionEntry: "0",
      commissionExit: "0",
      strategy: "",
      notes: ""
    });
  };

  const getContractsLabel = () => {
    switch (formData.assetType) {
      case "TH_STOCK":
      case "US_STOCK": return "จำนวนหุ้น (Shares)";
      case "FUND": return "จำนวนหน่วย (Units)";
      case "CRYPTO": return "จำนวนเหรียญ (Coins)";
      case "TFEX":
      default: return "จำนวนสัญญา";
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold">บันทึกพอร์ต & การเทรด</h2>
        <p className="text-textMuted text-sm mt-1">เพิ่มข้อมูลสินทรัพย์ใหม่หรือการเทรดของคุณ</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">

        {/* ─── Form ─── */}
        <div className="flex-1">
          <form onSubmit={handleSubmit} className="card !p-0 overflow-hidden">

            {/* ── Section 0: ประเภทสินทรัพย์ ── */}
            <div className="p-5 space-y-4 bg-gray-50/30 dark:bg-white/[0.015] border-b border-gray-100 dark:border-white/[0.04]">
              <SectionLabel icon={Wallet} label="ประเภทสินทรัพย์" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="form-group sm:col-span-1">
                  <label htmlFor="assetType">หมวดหมู่ <span className="required">*</span></label>
                  <select id="assetType" value={formData.assetType} onChange={handleAssetTypeChange} required className="font-semibold text-brand-start">
                    <option value="TFEX">TFEX</option>
                    <option value="TH_STOCK">หุ้นไทย</option>
                    <option value="US_STOCK">หุ้นอเมริกา</option>
                    <option value="FUND">กองทุนรวม</option>
                    <option value="CRYPTO">คริปโต</option>
                  </select>
                </div>
                {formData.currency !== "THB" && (
                  <>
                    <div className="form-group">
                      <label htmlFor="currency">สกุลเงิน</label>
                      <input type="text" id="currency" value={formData.currency} onChange={handleChange} placeholder="USD, EUR, etc." />
                    </div>
                    <div className="form-group">
                      <label htmlFor="exchangeRate" className="flex items-center justify-between">
                        <span>FX Rate (บาท/{formData.currency})</span>
                        {autoRate && (
                          <span className="text-[10px] text-brand-start font-mono bg-brand-start/8 px-1.5 py-0.5 rounded font-semibold">AUTO</span>
                        )}
                      </label>
                      <div className="relative">
                        <input type="number" id="exchangeRate" step="any" value={formData.exchangeRate} onChange={handleChange} required className="!pr-10" />
                        <button
                          type="button"
                          onClick={async () => {
                            const rate = await fetchExchangeRate();
                            if (rate) setFormData(prev => ({ ...prev, exchangeRate: rate.toFixed(4) }));
                          }}
                          disabled={rateLoading}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-textMuted/40 hover:text-brand-start transition-colors"
                          title="ดึงอัตราแลกเปลี่ยนล่าสุด"
                        >
                          <RefreshCw className={clsx("w-4 h-4", rateLoading && "animate-spin")} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Section 1: ข้อมูลสัญญา ── */}
            <div className="p-5 space-y-4 border-b border-gray-100 dark:border-white/[0.04]">
              <SectionLabel icon={CalendarDays} label="ข้อมูลสินทรัพย์" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="form-group">
                  <label htmlFor="date">วันที่ <span className="required">*</span></label>
                  <input type="date" id="date" value={formData.date} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="symbol">Symbol <span className="required">*</span></label>
                  {formData.assetType === "TFEX" ? (
                    <select id="symbol" value={formData.symbol} onChange={handleChange} required>
                      <option value="">เลือก Symbol</option>
                      <option value="S50">S50 – SET50 Index</option>
                      <option value="GF">GF – Gold Futures</option>
                      <option value="GFM">GFM – Gold-D</option>
                      <option value="SIF">SIF – Single Stock</option>
                      <option value="DW">DW</option>
                      <option value="Other">อื่นๆ</option>
                    </select>
                  ) : (
                    <input type="text" id="symbol" value={formData.symbol} onChange={handleChange} placeholder="เช่น AAPL, BTC, PTT" required className="uppercase" />
                  )}
                </div>
                {formData.assetType === "TFEX" && (
                  <div className="form-group">
                    <label htmlFor="series">Series</label>
                    <input type="text" id="series" placeholder="เช่น M26, H26" value={formData.series} onChange={handleChange} list="seriesList" />
                    <datalist id="seriesList">
                      <option value="H26" /><option value="M26" />
                      <option value="U26" /><option value="Z26" /><option value="H27" />
                    </datalist>
                  </div>
                )}
              </div>

              {/* Side toggle */}
              <div className="form-group max-w-sm">
                <label>Side <span className="required">*</span></label>
                <div className="flex rounded-xl p-1 gap-1 bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
                  {(formData.assetType === "TFEX" ? ["Long", "Short"] : ["Buy", "Sell"]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, side: s as "Long" | "Short" | "Buy" | "Sell" }))}
                      className={clsx(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200",
                        formData.side === s
                          ? (s === "Long" || s === "Buy")
                            ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                            : "bg-rose-500/15 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.1)]"
                          : "text-textMuted/60 hover:text-textMuted"
                      )}
                    >
                      {(s === "Long" || s === "Buy") ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Section 2: ราคา & ปริมาณ ── */}
            <div className="p-5 space-y-4 border-b border-gray-100 dark:border-white/[0.04]">
              <SectionLabel icon={ChartCandlestick} label={`ราคา & ปริมาณ ${formData.currency !== "THB" ? `(${formData.currency})` : ""}`} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="entry" className="flex items-center justify-between gap-2">
                    <span>
                      {formData.assetType === "CRYPTO" ? "ราคา/เหรียญ (Entry)" : "ราคาเข้า (Entry)"}
                      {formData.assetType !== "CRYPTO" && <span className="required"> *</span>}
                    </span>
                    {computedEntryFromTotal !== null && computedEntryFromTotal > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-start/10 text-brand-start">AUTO</span>
                    )}
                  </label>
                  <input
                    type="number" id="entry" step="any" placeholder="0.00000000"
                    value={computedEntryFromTotal !== null && computedEntryFromTotal > 0
                      ? computedEntryFromTotal.toFixed(8).replace(/\.?0+$/, '')
                      : formData.entry}
                    onChange={e => {
                      if (formData.assetType === "CRYPTO") setCryptoTotalEntry("");
                      handleChange(e);
                    }}
                    required={formData.assetType !== "CRYPTO" || !cryptoTotalEntry}
                    readOnly={computedEntryFromTotal !== null && computedEntryFromTotal > 0 && !!cryptoTotalEntry}
                    className={clsx(computedEntryFromTotal !== null && cryptoTotalEntry && "opacity-60 cursor-default")}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="exit" className="flex items-center justify-between gap-2">
                    <span>ราคาออก (Exit)</span>
                    <span className={clsx(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      isOpen ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                    )}>
                      {isOpen ? "OPEN" : "CLOSED"}
                    </span>
                  </label>
                  <input type="number" id="exit" step="any" placeholder="ปล่อยว่าง = ยังถืออยู่" value={formData.exit} onChange={handleChange} />
                </div>
              </div>

              {/* Crypto total investment field */}
              {formData.assetType === "CRYPTO" && (
                <div className="form-group max-w-sm">
                  <label htmlFor="cryptoTotalEntry" className="flex items-center justify-between gap-2">
                    <span>มูลค่ารวมที่ซื้อ ({formData.currency})</span>
                    <span className="text-[9px] text-textMuted/40 font-normal">คำนวณราคา/เหรียญอัตโนมัติ</span>
                  </label>
                  <input
                    type="number"
                    id="cryptoTotalEntry"
                    step="any"
                    placeholder={`เช่น 5000 ${formData.currency} (แทนการใส่ราคา/เหรียญ)`}
                    value={cryptoTotalEntry}
                    onChange={e => {
                      const total = e.target.value;
                      setCryptoTotalEntry(total);
                      if (total) {
                        setFormData(prev => ({ ...prev, entry: "" }));
                      }
                    }}
                  />
                  {cryptoTotalEntry && contracts > 0 && (
                    <div className="text-[10px] text-brand-start/70 mt-1">
                      ≈ {formData.currency === "THB" ? "฿" : "$"}{((parseFloat(cryptoTotalEntry) || 0) / contracts).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} / เหรียญ
                    </div>
                  )}
                </div>
              )}

              <div className={clsx("grid grid-cols-1 gap-4", isOpen ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                <div className="form-group">
                  <label htmlFor="contracts">
                    <Hash className="w-3.5 h-3.5 inline-block mr-1 opacity-40" />
                    {getContractsLabel()} <span className="required">*</span>
                  </label>
                  <input type="number" id="contracts" step="any" min="0" value={formData.contracts} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="commissionEntry">ค่าธรรมเนียม ขาเข้า ({isUSD ? formData.currency : '฿'})</label>
                  <input type="number" id="commissionEntry" step="any" placeholder="0" value={formData.commissionEntry} onChange={handleChange} />
                </div>
                {!isOpen && (
                  <div className="form-group">
                    <label htmlFor="commissionExit">ค่าธรรมเนียม ขาออก ({isUSD ? formData.currency : '฿'})</label>
                    <input type="number" id="commissionExit" step="any" placeholder="0" value={formData.commissionExit} onChange={handleChange} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 3: บันทึก ── */}
            <div className="p-5 space-y-4 border-b border-gray-100 dark:border-white/[0.04]">
              <SectionLabel icon={StickyNote} label="บันทึก" />

              <div className="form-group">
                <label htmlFor="strategy">กลยุทธ์</label>
                <input type="text" id="strategy" placeholder="DCA, Breakout, Swing…" value={formData.strategy} onChange={handleChange} list="strategyList" />
                <datalist id="strategyList">
                  <option value="DCA" /><option value="Breakout" />
                  <option value="Trend Follow" /><option value="Value Investing" />
                  <option value="Swing" /><option value="News Trading" />
                </datalist>
              </div>

              <div className="form-group">
                <label htmlFor="notes">บันทึกเพิ่มเติม</label>
                <textarea id="notes" rows={3} placeholder="จดบันทึกเกี่ยวกับรายการนี้…" value={formData.notes} onChange={handleChange} />
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-4 flex gap-3">
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                <RotateCcw className="w-4 h-4" /> ล้างฟอร์ม
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>
                <Save className="w-4 h-4" />
                {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
              </button>
            </div>
          </form>
        </div>

        {/* ─── P&L Preview ─── */}
        <div className="w-full xl:w-[360px] shrink-0">
          <div className="card sticky top-6 md:top-10 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-white/[0.06]">
              <TrendingUp className="w-4 h-4 text-brand-start" />
              <h3 className="font-semibold text-sm">P&L Preview</h3>
              <span className={clsx(
                "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full",
                isOpen
                  ? "bg-amber-500/10 text-amber-400 animate-pulse"
                  : formData.entry
                    ? "bg-brand-start/10 text-brand-start"
                    : "bg-white/[0.04] text-textMuted/40"
              )}>
                {isOpen ? (formData.entry ? (formData.assetType === "TFEX" ? "OPEN" : "HOLDING") : "—") : "CLOSED"}
              </span>
            </div>

            {isOpen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center py-8 rounded-xl bg-amber-500/[0.05] border border-amber-500/10">
                  <div className="text-center space-y-1.5">
                    <p className="text-amber-400 font-semibold text-sm">{formData.assetType === "TFEX" ? "Open Position" : "Holding Asset"}</p>
                    <p className="text-textMuted/50 text-xs">กรอกราคา Exit เพื่อคำนวณ P&L</p>
                  </div>
                </div>
                {commissionEntry > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm">
                    <span className="text-textMuted/60 text-xs">ค่าธรรมเนียมเข้า</span>
                    <span className="font-mono text-rose-400 text-sm">
                      -{isUSD ? `$${commissionEntry.toFixed(2)} (≈ ฿${(commissionEntry * exchangeRate).toFixed(2)})` : `฿${commissionEntry.toFixed(2)}`}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm">
                  <span className="text-textMuted/60 text-xs">ส่วนต่างราคา</span>
                  <span className={clsx("font-mono font-medium text-sm",
                    points > 0 ? "text-emerald-400" : points < 0 ? "text-rose-400" : ""
                  )}>
                    {points > 0 ? '+' : ''}{points.toFixed(4)}
                  </span>
                </div>

                <div className="flex justify-between items-center px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm">
                  <span className="text-textMuted/60 text-xs">P&L (฿) {exchangeRate !== 1 && `FX: ${exchangeRate}`}</span>
                  <span className={clsx("font-mono font-medium text-sm",
                    pnlBaht > 0 ? "text-emerald-400" : pnlBaht < 0 ? "text-rose-400" : ""
                  )}>
                    {pnlBaht >= 0 ? '+' : '-'}฿{Math.abs(pnlBaht).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {totalCommissionTHB > 0 && (
                  <div className="flex justify-between items-center px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div>
                      <div className="text-textMuted/60 text-xs">ค่าธรรมเนียมรวม</div>
                      <div className="text-[10px] text-textMuted/40">
                        {isUSD
                          ? `${formData.currency} ${(commissionEntry + commissionExit).toFixed(2)} × ${exchangeRate.toFixed(2)}`
                          : `เข้า ฿${commissionEntry.toFixed(0)} + ออก ฿${commissionExit.toFixed(0)}`}
                      </div>
                    </div>
                    <span className="font-mono text-rose-400 text-sm">-฿{totalCommissionTHB.toFixed(2)}</span>
                  </div>
                )}

                {/* Net P&L */}
                <div className={clsx(
                  "px-4 py-4 rounded-xl border",
                  netPnl > 0 ? "bg-emerald-500/[0.06] border-emerald-500/15" : netPnl < 0 ? "bg-rose-500/[0.06] border-rose-500/15" : "bg-white/[0.02] border-white/[0.06]"
                )}>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs text-textMuted/70">Net P&L (฿)</span>
                    <span className={clsx(
                      "font-mono font-bold text-xl",
                      netPnl > 0 ? "text-emerald-400" : netPnl < 0 ? "text-rose-400" : ""
                    )}>
                      {netPnl > 0 ? '+' : netPnl < 0 ? '-' : ''}฿{Math.abs(netPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Multiplier / trade value info */}
            {formData.assetType === "TFEX" && formData.symbol && (
              <div className="flex items-center justify-between text-xs text-textMuted/50 bg-white/[0.02] px-3 py-2 rounded-lg border border-white/[0.04]">
                <span>ตัวคูณ {formData.symbol}</span>
                <span className="font-mono font-semibold text-textMuted">{multiplier} ฿/จุด</span>
              </div>
            )}
            {formData.assetType !== "TFEX" && (
              <div className="flex items-center justify-between text-xs text-textMuted/50 bg-white/[0.02] px-3 py-2 rounded-lg border border-white/[0.04]">
                <span>ปริมาณเทรด ({formData.currency})</span>
                <span className="font-mono font-semibold text-textMuted">
                  {((formData.side === 'Long' || formData.side === 'Buy') ? entryPrice : exitPrice) * contracts !== 0
                    ? (((formData.side === 'Long' || formData.side === 'Buy') ? entryPrice : exitPrice) * contracts).toLocaleString('en-US', { maximumFractionDigits: 2 })
                    : "0"}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
