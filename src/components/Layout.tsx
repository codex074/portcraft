import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";
import { Menu } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "TFEX",
  "/portfolio": "Portfolio",
  "/record": "บันทึกรายการ",
  "/settings": "ตั้งค่า",
};

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isDark } = useTheme();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "PortCarft";

  return (
    <div
      className="flex min-h-screen selection:bg-brand-start/30 transition-colors duration-300"
      style={{ background: isDark ? '#0d0d0d' : '#f8f9fb', color: isDark ? '#ffffff' : '#111827' }}
    >
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="flex-1 flex flex-col md:ml-[260px] transition-all duration-300 min-h-screen relative max-w-full overflow-x-clip">
        {/* Mobile Header */}
        <header
          className="md:hidden h-14 flex items-center justify-between px-4 sticky top-0 z-20 backdrop-blur-xl"
          style={{
            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            background: isDark ? 'rgba(13,13,13,0.85)' : 'rgba(248,249,251,0.85)',
          }}
        >
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            style={{ color: isDark ? '#9aa0a6' : '#6b7280' }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sm" style={{ color: isDark ? '#ffffff' : '#111827' }}>
            {pageTitle}
          </span>
          <ThemeToggle />
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 lg:p-10 pt-6 md:pt-8 relative z-10 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
