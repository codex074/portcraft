import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Swal from "sweetalert2";
import { Calculator, Save, Info, Database, Shield } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [multipliers, setMultipliers] = useState({
    S50: "200",
    GF: "1000",
    GFM: "100",
    SIF: "1000",
    DW: "1",
    Other: "1"
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, "user_settings", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().multipliers) {
          const m = docSnap.data().multipliers;
          setMultipliers({
            S50: m.S50?.toString() || "200",
            GF: m.GF?.toString() || "1000",
            GFM: m.GFM?.toString() || "100",
            SIF: m.SIF?.toString() || "1000",
            DW: m.DW?.toString() || "1",
            Other: m.Other?.toString() || "1"
          });
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };
    fetchSettings();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setMultipliers(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Parse to numbers
      const parsedMultipliers = {
        S50: parseFloat(multipliers.S50) || 200,
        GF: parseFloat(multipliers.GF) || 1000,
        GFM: parseFloat(multipliers.GFM) || 100,
        SIF: parseFloat(multipliers.SIF) || 1000,
        DW: parseFloat(multipliers.DW) || 1,
        Other: parseFloat(multipliers.Other) || 1
      };

      await setDoc(doc(db, "user_settings", user.uid), {
        userId: user.uid,
        multipliers: parsedMultipliers,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        text: "อัพเดทค่า Multiplier เรียบร้อยแล้ว",
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      Swal.fire({
        icon: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        text: "ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setLoading(false);
    }
  };

  const multiplierFields = [
    { id: "S50", label: "SET50 Futures" },
    { id: "GF", label: "Gold Futures (GF)" },
    { id: "GFM", label: "Gold-D (GFM)" },
    { id: "SIF", label: "Single Stock Futures" },
    { id: "DW", label: "DW" },
    { id: "Other", label: "อื่นๆ" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: isDark ? '#ffffff' : '#111827' }}>ตั้งค่า</h2>
        <p className="text-textMuted text-sm mt-1">กำหนดค่า Point Multipliers สำหรับการคำนวณ P&L</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Multipliers Card */}
        <div className="card space-y-5">
          <div className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isDark ? 'rgba(0,212,170,0.1)' : 'rgba(0,212,170,0.08)' }}
            >
              <Calculator className="w-[18px] h-[18px]" style={{ color: '#00d4aa' }} />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]" style={{ color: isDark ? '#ffffff' : '#111827' }}>
                Point Multipliers
              </h3>
              <p className="text-[11px] text-textMuted/70">บาท/จุด</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {multiplierFields.map(({ id, label }) => (
              <div key={id} className="form-group mb-0">
                <label htmlFor={id} className="!text-[12px] !font-medium !tracking-wide" style={{ color: isDark ? 'rgba(154,160,166,0.8)' : '#6b7280' }}>
                  {label}
                </label>
                <input
                  type="number"
                  id={id}
                  value={multipliers[id as keyof typeof multipliers]}
                  onChange={handleChange}
                  step="any"
                  className="!text-sm font-mono"
                />
              </div>
            ))}
          </div>

          <div className="pt-4" style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
            <button
              onClick={handleSave}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              <Save className="w-4 h-4" /> {loading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>

        {/* About Card */}
        <div className="card space-y-5">
          <div className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isDark ? 'rgba(96,165,250,0.1)' : 'rgba(59,130,246,0.08)' }}
            >
              <Info className="w-[18px] h-[18px]" style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]" style={{ color: isDark ? '#ffffff' : '#111827' }}>
                เกี่ยวกับระบบ
              </h3>
              <p className="text-[11px] text-textMuted/70">TFEX Trading Journal</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-textMuted leading-relaxed">
              ระบบใหม่นี้ใช้ Firebase Authentication และ Firestore เป็นฐานข้อมูลหลักแทนการใช้ Google Apps Script แบบเดิม
            </p>

            <div className="space-y-2">
              <div
                className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                }}
              >
                <Database className="w-4 h-4 mt-0.5 flex-shrink-0 text-textMuted/60" />
                <span style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4b5563' }}>
                  ข้อมูลการเทรดทั้งหมดถูกจัดเก็บไว้ใน Firestore ภายใต้รายชื่อผู้ใช้นี้เท่านั้น
                </span>
              </div>
              <div
                className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                }}
              >
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 text-textMuted/60" />
                <span style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#4b5563' }}>
                  การคำนวณ P&L สุทธิและสถิติต่างๆ จะทำบนฝั่ง Client และวิเคราะห์ผ่าน Dashboard
                </span>
              </div>
            </div>

            <div
              className="flex items-start gap-2.5 p-3.5 rounded-xl text-[13px] mt-2"
              style={{
                background: isDark ? 'rgba(96,165,250,0.06)' : 'rgba(59,130,246,0.05)',
                border: `1px solid ${isDark ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.12)'}`,
                color: isDark ? 'rgba(147,197,253,0.9)' : '#2563eb',
              }}
            >
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ opacity: 0.7 }} />
              <span>
                ระบบถูกตั้งค่า Firebase Project รหัส <span className="font-mono font-medium">tefex-trading</span> อัตโนมัติแล้ว ไม่จำเป็นต้องเชื่อมต่อ Web App URL เพิ่มเติม
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
