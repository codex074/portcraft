import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { LayoutDashboard, PlusCircle, Settings, LogOut, Briefcase } from "lucide-react";
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
    { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
    { to: "/dashboard", icon: LayoutDashboard, label: "TFEX" },
    { to: "/record", icon: PlusCircle, label: "บันทึกรายการ" },
    { to: "/settings", icon: Settings, label: "ตั้งค่า" },
  ];

  const userInitial = user?.displayName?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || "U";

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 w-[260px] flex flex-col z-40 transition-transform duration-300 ease-out md:translate-x-0 h-screen",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: isDark ? '#111111' : '#ffffff',
          borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
        }}
      >
        {/* Brand */}
        <div className="h-[72px] flex items-center px-5 gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(0,212,170,0.15), rgba(124,92,252,0.15))' }}
          >
            <svg viewBox="0 0 32 32" fill="none" className="w-5 h-5">
              <rect x="2" y="8" width="28" height="16" rx="3" stroke={isDark ? '#fff' : '#374151'} strokeWidth="2" opacity="0.6" />
              <path d="M8 18L12 12L16 16L20 10L24 14" stroke="url(#brandGradSB)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="brandGradSB" x1="8" y1="18" x2="24" y2="10">
                  <stop stopColor="#00d4aa" />
                  <stop offset="1" stopColor="#7c5cfc" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-base font-bold truncate" style={{ color: isDark ? '#fff' : '#111827' }}>
                PortCarft
              </h1>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: isDark ? '#ccc' : '#666' }}>
                v.1.0
              </span>
            </div>
            <span className="text-[10px] font-mono gradient-text font-semibold tracking-wider">PORTFOLIO JOURNAL</span>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className="block"
            >
              {({ isActive }) => (
                <div
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.9rem] transition-all duration-200 relative",
                    isActive
                      ? "font-semibold"
                      : "font-medium hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                  )}
                  style={{
                    background: isActive ? (isDark ? 'rgba(0,212,170,0.08)' : 'rgba(0,212,170,0.06)') : undefined,
                    color: isActive ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#9aa0a6' : '#6b7280'),
                  }}
                >
                  {/* Active left accent */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                      style={{ background: 'linear-gradient(180deg, #00d4aa, #7c5cfc)', boxShadow: '0 0 8px rgba(0,212,170,0.4)' }}
                    />
                  )}
                  <item.icon
                    className="w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200"
                    style={{ color: isActive ? '#00d4aa' : undefined }}
                  />
                  <span>{item.label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 space-y-3">
          {/* Theme toggle */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-medium" style={{ color: isDark ? '#666' : '#9ca3af' }}>โหมด</span>
            <ThemeToggle />
          </div>

          {/* Divider */}
          <div className="mx-2 h-px" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #00d4aa, #7c5cfc)' }}
            >
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate" style={{ color: isDark ? '#ccc' : '#374151' }}>
                {user?.displayName || 'User'}
              </div>
              <div className="text-[10px] truncate" style={{ color: isDark ? '#666' : '#9ca3af' }}>
                {user?.email}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 w-full text-left text-xs font-medium"
            style={{ color: isDark ? '#666' : '#9ca3af' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f87171';
              e.currentTarget.style.background = isDark ? 'rgba(248,113,113,0.08)' : 'rgba(248,113,113,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isDark ? '#666' : '#9ca3af';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
}
