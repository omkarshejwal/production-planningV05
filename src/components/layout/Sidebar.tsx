import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Cpu,
  ClipboardCheck,
  Sliders,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Boxes,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { ActiveModule } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface MenuNavItem {
  id: ActiveModule;
  label: string;
  icon: React.ElementType;
  badge?: string;
  /**
   * module_master name this entry maps to. Visibility is derived from the
   * database permission rows (module or any of its descendants readable) --
   * never from hardcoded permission values.
   */
  module?: string;
}

const NAV_ITEMS: MenuNavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Production Planning', label: 'Production Planning', icon: CalendarDays, module: 'Production Planning', badge: 'Excel' },
  { id: 'Master Management', label: 'Master Management', icon: Cpu, module: 'Master Management' },
  { id: 'Quality Control', label: 'Hourly Production', icon: ClipboardCheck, module: 'Quality Control' },
  { id: 'Settings', label: 'Settings', icon: Sliders },
  { id: 'Profile', label: 'Profile', icon: User },
];

/** module_master rows already represented by a dedicated nav entry above. */
const STATIC_MODULE_NAMES = new Set(['Production Planning', 'Master Management', 'Quality Control']);

export const Sidebar: React.FC = () => {
  const { activeModule, setActiveModule } = useERP();
  const { canReadModule, modules, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const visibleItems = (() => {
    const visible = NAV_ITEMS.filter((item) => (item.module ? canReadModule(item.module) : true));

    // Modules registered in module_master that have no hand-built nav entry
    // are surfaced automatically with the same read check, so newly added
    // modules need no frontend change to be permission-protected.
    const dynamicItems: MenuNavItem[] = (modules ?? [])
      .filter(
        (m) =>
          m.is_active &&
          m.parent_module_id == null &&
          !STATIC_MODULE_NAMES.has(m.module_name) &&
          canReadModule(m.module_name)
      )
      .map((m) => ({ id: m.module_name, label: m.module_name, icon: Boxes, module: m.module_name }));

    const settingsAt = visible.findIndex((item) => item.id === 'Settings');
    if (settingsAt === -1) return [...visible, ...dynamicItems];
    return [...visible.slice(0, settingsAt), ...dynamicItems, ...visible.slice(settingsAt)];
  })();

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-5 w-6 h-6 bg-blue-600 border border-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 shadow-sm z-20 transition-colors"
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="p-3 space-y-1 overflow-y-auto flex-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <React.Fragment key={item.id}>
              <button
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-500'
                  }`}
                />

                {!isCollapsed && (
                  <span className="flex-1 text-left truncate">{item.label}</span>
                )}

                {!isCollapsed && item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      isActive
                        ? 'bg-blue-700 text-blue-100'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>

              {item.id === 'Profile' && (
                <button
                  onClick={() => void logout()}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors ${
                    isCollapsed ? 'justify-center px-0' : ''
                  }`}
                  title={isCollapsed ? 'Logout' : undefined}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span>Logout</span>}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
};