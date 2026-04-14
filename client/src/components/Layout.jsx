import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Activity, History, Bell, Menu, X, RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import ConnectionStatus from "./ConnectionStatus";
import ThemeToggle from "./ThemeToggle";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: Activity, exact: true },
  { to: "/history", label: "History", icon: History },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

export default function Layout({
  children,
  darkMode,
  setDarkMode,
  configReloadedAt,
  lastConfigData,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('sidebarVisible');
    return saved !== null ? saved === 'true' : true;
  });
  const [notification, setNotification] = useState(null);

  const toggleDesktopSidebar = () => {
    setDesktopSidebarVisible(prev => {
      const next = !prev;
      localStorage.setItem('sidebarVisible', next);
      return next;
    });
  };

  // Show a banner whenever config.yaml is reloaded
  useEffect(() => {
    if (!configReloadedAt) return;
    const count = lastConfigData?.targets_count;
    const message =
      count != null
        ? `config.yaml reloaded — ${count} target${count !== 1 ? "s" : ""} synced`
        : "config.yaml reloaded — targets synced";
    setNotification(message);
    const timer = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [configReloadedAt, lastConfigData]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-56 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800 transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          desktopSidebarVisible ? "lg:relative lg:translate-x-0" : "lg:hidden",
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">
            n8watch
          </span>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
          <button
            className="ml-auto hidden lg:flex text-gray-400 hover:text-white"
            onClick={toggleDesktopSidebar}
            title="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
          n8watch v1.0
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Config reload notification banner */}
        {notification && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-600 text-white text-sm flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={14} />
              <span>{notification}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-white/80 hover:text-white"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          {!desktopSidebarVisible && (
            <button
              className="hidden lg:flex text-gray-400 hover:text-white"
              onClick={toggleDesktopSidebar}
              title="Show sidebar"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}
          <span className="text-base font-semibold text-white">
            n8watch
          </span>
          <div className="flex-1" />
          <ConnectionStatus />
          <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
