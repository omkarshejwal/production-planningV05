import React, { useState } from 'react';
import {
  Bell,
  Search,
  ChevronDown,
  Layers,
  User,
  Settings,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import officialLogo from '../../assets/logo';

export const Header: React.FC = () => {
  const {
    activeModule,
    setActiveModule,
    searchQuery,
    setSearchQuery,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    user,
    bottles,
    machines,
    jobs,
    openDrawerForEdit,
  } = useERP();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Filter search matches across Bottles, Machines, Jobs
  const matchingBottles = searchQuery.trim()
    ? bottles.filter(
        (b) =>
          b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.drawingNumber.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const matchingMachines = searchQuery.trim()
    ? machines.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const matchingJobs = searchQuery.trim()
    ? jobs.filter(
        (j) =>
          j.jobNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          j.customerName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const totalSearchCount = matchingBottles.length + matchingMachines.length + matchingJobs.length;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 shadow-xs">
      {/* Left: Brand Logo & Title */}
      <div className="flex items-center gap-3 min-w-56">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-xs">
          <img src={officialLogo} alt="Empire Industries" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 leading-none tracking-tight">Vitrum Glass</h1>
          <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
            ERP SYSTEM
          </span>
        </div>
      </div>

      {/* Center: Current Module Name */}
      <div className="hidden md:flex items-center justify-center flex-1">
        <h2 className="text-base font-semibold text-slate-800 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200/80">
          {activeModule}
        </h2>
      </div>

      {/* Right: Search, Notifications, Profile */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative">

          {/* Search Dropdown Popup */}
          {showSearchResults && searchQuery.trim() !== '' && (
            <div className="absolute right-0 top-11 w-80 md:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-96 overflow-y-auto animate-in fade-in-50">
              <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-400 border-b border-slate-100">
                <span>SEARCH RESULTS ({totalSearchCount})</span>
                <button
                  onClick={() => setShowSearchResults(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Close
                </button>
              </div>

              {totalSearchCount === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No matching bottles, machines, or job numbers found for "{searchQuery}"
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {matchingBottles.length > 0 && (
                    <div className="p-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                        Bottles ({matchingBottles.length})
                      </span>
                      {matchingBottles.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setActiveModule('Production Planning');
                            setShowSearchResults(false);
                          }}
                          className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">{b.name}</p>
                            <p className="text-[10px] text-slate-400">{b.drawingNumber} • {b.customerName}</p>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
                            {b.color}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {matchingMachines.length > 0 && (
                    <div className="p-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                        Machines ({matchingMachines.length})
                      </span>
                      {matchingMachines.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setActiveModule('Machines');
                            setShowSearchResults(false);
                          }}
                          className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">{m.name} ({m.code})</p>
                            <p className="text-[10px] text-slate-400">{m.sectionsCount} Sec • {m.sectionType}</p>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                            {m.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {matchingJobs.length > 0 && (
                    <div className="p-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 block mb-1">
                        Production Jobs ({matchingJobs.length})
                      </span>
                      {matchingJobs.map((j) => (
                        <div
                          key={j.id}
                          onClick={() => {
                            openDrawerForEdit(j);
                            setShowSearchResults(false);
                          }}
                          className="p-2 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-800">{j.jobNumber}</p>
                            <p className="text-[10px] text-slate-400">{j.customerName}</p>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-medium">
                            {j.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 relative transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-11 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 animate-in fade-in-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-800">Plant Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <button
                  onClick={clearAllNotifications}
                  className="text-[11px] text-blue-600 hover:underline font-medium"
                >
                  Mark all read
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      n.read ? 'bg-white border-slate-100 opacity-75' : 'bg-blue-50/50 border-blue-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {n.type === 'alert' && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                      {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                      {n.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                      {n.type === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900">{n.title}</p>
                          <span className="text-[10px] text-slate-400">{n.time}</span>
                        </div>
                        <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-blue-100">
              AS
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{user.role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 top-11 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in-50">
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{user.name}</p>
                <p className="text-[11px] text-slate-500">{user.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                  {user.plantLocation}
                </span>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setActiveModule('Profile');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  Profile Details
                </button>

                <button
                  onClick={() => {
                    setActiveModule('Settings');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  Plant Master Settings
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    alert('Log Out triggered - Demo Session Reset');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out of ERP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
