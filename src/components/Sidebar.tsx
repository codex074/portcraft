import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { LayoutDashboard, PlusCircle, List, Settings, LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import clsx from "clsx";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/record", icon: PlusCircle, label: "บันทึกการเทรด" },
    { to: "/trades", icon: List, label: "ประวัติการเทรด" },
    { to: "/settings", icon: Settings, label: "ตั้งค่า" },
  ];

  const bg = isDark ? '#151515' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.05)' : 'rgb(229,231,235)';
  const textMuted = isDark ? '#9aa0a6' : '#6b7280';
  const activeItemBg = isDark ? '#202020' : '#f3f4f6';
  const activeItemBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgb(209,213,219)';

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={clsx(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 w-64 flex flex-col z-40 transition-all duration-300 md:translate-x-0 h-screen shadow-xl",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: bg, borderRight: `1px solid ${border}` }}
      >
        {/* Brand */}
        <div className="h-20 flex items-center px-6 gap-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{ background: isDark ? '#202020' : '#f3f4f6', border: `1px solid ${border}` }}
          >
            <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6"
              style={{ color: isDark ? '#ffffff' : '#374151' }}>
              <rect x="2" y="8" width="28" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
              <path d="M8 18L12 12L16 16L20 10L24 14" stroke="url(#brandGradSB)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="brandGradSB" x1="8" y1="18" x2="24" y2="10">
                  <stop stopColor="#00d4aa" />
                  <stop offset="1" stopColor="#7c5cfc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: isDark ? '#ffffff' : '#111827' }}>TFEX Journal</h1>
            <span className="text-xs text-brand-start font-mono">Trading Tracker</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className="block rounded-xl transition-all duration-200"
            >
              {({ isActive }) => (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-[0.95rem] transition-all duration-200"
                  style={{
                    background: isActive ? activeItemBg : 'transparent',
                    border: isActive ? `1px solid ${activeItemBorder}` : '1px solid transparent',
                    color: isActive ? (isDark ? '#ffffff' : '#111827') : textMuted,
                  }}
                >
                  <item.icon
                    className="w-5 h-5 transition-colors duration-300"
                    style={{ color: isActive ? '#00d4aa' : undefined }}
                  />
                  <span>{item.label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 flex flex-col gap-3" style={{ borderTop: `1px solid ${border}` }}>
          {/* Theme toggle row */}
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium" style={{ color: textMuted }}>โหมด</span>
            <ThemeToggle />
          </div>

          <div className="flex flex-col gap-1 px-2">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: textMuted }}>Logged in as</span>
            <span className="text-sm truncate text-brand-start">{user?.email}</span>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors w-full text-left hover:bg-red-500/10 hover:text-red-400"
            style={{ color: textMuted }}
          >
            <LogOut className="w-5 h-5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
}
