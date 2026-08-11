import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Cpu,
  Sliders,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { ActiveModule } from '../../types';

interface MenuNavItem {
  id: ActiveModule;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: MenuNavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Production Planning', label: 'Production Planning', icon: CalendarDays, badge: 'Excel' },
  { id: 'Machines', label: 'Machines', icon: Cpu },
  { id: 'Settings', label: 'Settings', icon: Sliders },
  { id: 'Profile', label: 'Profile', icon: User },
];

export const Sidebar: React.FC = () => {
  const { activeModule, setActiveModule, notifications } = useERP();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 relative ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-5 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 shadow-xs z-20"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Main Navigation List */}
      <div className="p-3 space-y-1 overflow-y-auto flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              {!isCollapsed && (
                <span className="flex-1 text-left truncate">{item.label}</span>
              )}
              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Logout button at bottom */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={() => alert('Log Out triggered - Returning to Login')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
          title={isCollapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
