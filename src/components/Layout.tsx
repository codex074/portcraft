import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";
import { Menu } from "lucide-react";

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isDark } = useTheme();

  return (
    <div
      className="flex min-h-screen selection:bg-brand-start/30 transition-colors duration-300"
      style={{ background: isDark ? '#0a0a0a' : '#f3f4f6', color: isDark ? '#ffffff' : '#111827' }}
    >
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className="flex-1 flex flex-col md:ml-64 transition-all duration-300 min-h-screen relative max-w-full overflow-hidden">
        {/* Mobile Header */}
        <header
          className="md:hidden h-16 border-b flex items-center justify-between px-4 sticky top-0 z-20 backdrop-blur-xl shadow-sm transition-colors duration-300"
          style={{
            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgb(229,231,235)',
            background: isDark ? 'rgba(21,21,21,0.8)' : 'rgba(255,255,255,0.8)',
          }}
        >
          <button 
            onClick={() => setIsSidebarOpen(true)}
            style={{ color: isDark ? '#9aa0a6' : '#6b7280' }}
            className="p-2 -ml-2 transition-colors hover:opacity-80"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-lg bg-gradient-to-r from-brand-start to-brand-end bg-clip-text text-transparent">
            TFEX Journal
          </span>
          <ThemeToggle />
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 pt-6 md:pt-10 relative z-10 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
