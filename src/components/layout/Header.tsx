import React, { useState } from 'react';
import {
  Bell,
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
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const {
    activeModule,
    setActiveModule,
    notifications,
    markNotificationRead,
    clearAllNotifications,
  } = useERP();
  const { user, logout } = useAuth();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  // const [showSearchResults, setShowSearchResults] = useState(false);

  const userName = user?.employee_name ?? 'User';
  const userRole = user?.role ?? 'Employee';
  const userEmail = user?.email ?? 'No email provided';
  const userDepartment = user?.department ?? 'General';
  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const unreadCount = notifications.filter((n) => !n.read).length;

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
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${n.read ? 'bg-white border-slate-100 opacity-75' : 'bg-blue-50/50 border-blue-100'
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
              {userInitials}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{userName}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{userRole}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 top-11 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in-50">
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{userName}</p>
                <p className="text-[11px] text-slate-500">{userEmail}</p>
                <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                  {userDepartment}
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
                  Settings
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    void logout();
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
