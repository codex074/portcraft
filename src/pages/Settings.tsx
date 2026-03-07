import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import Swal from "sweetalert2";
import { Calculator, Save, Info } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold">ตั้งค่า</h2>
        <p className="text-textMuted text-sm mt-1">กำหนดค่า Point Multipliers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card space-y-6">
          <h3 className="font-semibold text-lg flex items-center gap-2 pb-4 border-b border-gray-200 dark:border-white/5">
            <Calculator className="w-5 h-5 text-brand-start" />
            Point Multipliers (บาท/จุด)
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group mb-0">
              <label htmlFor="S50">S50</label>
              <input type="number" id="S50" value={multipliers.S50} onChange={handleChange} step="any" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="GF">Gold Futures (GF)</label>
              <input type="number" id="GF" value={multipliers.GF} onChange={handleChange} step="any" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="GFM">Gold-D (GFM)</label>
              <input type="number" id="GFM" value={multipliers.GFM} onChange={handleChange} step="any" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="SIF">Single Stock Futures</label>
              <input type="number" id="SIF" value={multipliers.SIF} onChange={handleChange} step="any" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="DW">DW</label>
              <input type="number" id="DW" value={multipliers.DW} onChange={handleChange} step="any" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="Other">อื่นๆ</label>
              <input type="number" id="Other" value={multipliers.Other} onChange={handleChange} step="any" />
            </div>
          </div>
          
          <div className="pt-4 border-t border-gray-200 dark:border-white/5">
            <button 
              onClick={handleSave} 
              disabled={loading}
              className="btn btn-primary w-full"
            >
              <Save className="w-4 h-4" /> {loading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
        
        <div className="card space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2 pb-4 border-b border-gray-200 dark:border-white/5">
            <Info className="w-5 h-5 text-blue-400" />
            เกี่ยวกับระบบ
          </h3>
          <div className="space-y-3 text-[0.95rem] text-textMuted leading-relaxed">
            <p>
              ระบบใหม่นี้ใช้ Firebase Authentication และ Firestore เป็นฐานข้อมูลหลักแทนการใช้ Google Apps Script แบบเดิม
            </p>
            <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-white/80">
              <li>ข้อมูลการเทรดทั้งหมดถูกจัดเก็บไว้ใน Firestore ภายใต้รายชื่อผู้ใช้นี้เท่านั้น</li>
              <li>การคำนวณ P&L สุทธิและสถิติต่างๆ จะทำบนฝั่ง Client และวิเคราะห์ผ่าน Dashboard</li>
            </ul>
             <p className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
               ระบบถูกตั้งค่า Firebase Project รหัส <span className="font-mono">tefex-trading</span> อัตโนมัติแล้ว ไม่จำเป็นต้องเชื่อมต่อ Web App URL เพิ่มเติม
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
