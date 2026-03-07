import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { LineChart, Wallet } from "lucide-react";

export default function Login() {
  const { user, signInWithGoogle } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md card flex flex-col items-center text-center space-y-8 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-start/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand-end/20 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-surfaceLight to-surface border border-white/10 flex items-center justify-center shadow-2xl">
            <LineChart className="w-10 h-10 text-brand-start" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-brand-start to-brand-end bg-clip-text text-transparent pb-1">
              TFEX Journal
            </h1>
            <p className="text-textMuted mt-2 text-sm">
              ระบบบันทึกและวิเคราะห์ผลการเทรดด้วย Google Account
            </p>
          </div>
        </div>

        <div className="w-full space-y-4 relative z-10">
          <button
            onClick={signInWithGoogle}
            className="w-full btn btn-primary flex items-center justify-center gap-3 py-3"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="font-semibold tracking-wide">เข้าสู่ระบบด้วย Google</span>
          </button>
        </div>

        <div className="text-xs text-textMuted mt-8 relative z-10 flex items-center justify-center gap-1.5 border-t border-gray-200 dark:border-white/5 pt-6 w-full">
           <Wallet className="w-3 h-3" /> ข้อมูลทั้งหมดถูกจัดเก็บด้วย Firebase
        </div>
      </div>
    </div>
  );
}
