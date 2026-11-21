import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { getNavItemsForRole, ROLE_LABELS } from '../../config/navigation';
import { ANIMATION_SPRINGS, scaledDuration, useAdaptiveMotion } from '../../config/animations';
import { PageRoute, UserRole } from '../../types/siakad';
import { resolveSchoolLogo } from '../../assets/branding';
import { useData } from '../../context/DataContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

interface SidebarProps {
  activeRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  role: UserRole;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onNavigate,
  collapsed,
  onToggleCollapse,
  role,
  onLogout,
}) => {
  const { schoolSettings } = useData();
  const motionProfile = useAdaptiveMotion();
  const items = getNavItemsForRole(role);

  return (
    <motion.aside
      aria-label="Navigasi utama desktop"
      initial={false}
      animate={{ width: collapsed ? 84 : 264 }}
      transition={motionProfile.reducedMotion ? { duration: 0.14 } : ANIMATION_SPRINGS.sidebar}
      className="no-print hidden md:flex flex-col shrink-0 sticky top-0 h-screen border-r border-emerald-950/10 dark:border-white/10 bg-white/85 dark:bg-slate-900/90 backdrop-blur-md z-30 overflow-hidden"
    >
      {/* Brand Header */}
      <div className="h-[72px] px-4 flex items-center justify-between border-b border-emerald-950/10 dark:border-white/10">
        <div className={`flex items-center gap-3 min-w-0 ${collapsed ? 'justify-center w-full' : ''}`}>
          <motion.div
            whileHover={motionProfile.reducedMotion ? undefined : { scale: 1.06, rotate: -3 }}
            transition={ANIMATION_SPRINGS.tactile}
            className="w-10 h-10 rounded-xl overflow-hidden border border-emerald-500/25 bg-white shadow-sm shrink-0 flex items-center justify-center p-0.5"
          >
            <img
              src={resolveSchoolLogo(schoolSettings.logoUrl)}
              alt="Logo PKBM Annur Karisma"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </motion.div>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="sidebar-brand-text"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: scaledDuration(0.18) }}
                className="min-w-0"
              >
                <p className="font-display font-extrabold text-sm tracking-tight text-slate-900 dark:text-white truncate">
                  SIAKAD PKBM
                </p>
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 truncate">
                  Annur Karisma
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.p
              key="sidebar-role-caption"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: scaledDuration(0.16) }}
              className="px-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap"
            >
              Menu · {ROLE_LABELS[role]}
            </motion.p>
          )}
        </AnimatePresence>

        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              data-no-lift
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              whileHover={motionProfile.reducedMotion ? undefined : 'hover'}
              whileTap={motionProfile.reducedMotion ? undefined : { scale: 0.98 }}
              className={`group relative w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                collapsed ? 'justify-center px-0' : ''
              } ${
                isActive
                  ? 'text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-emerald-50/90 dark:hover:bg-emerald-950/45 hover:text-emerald-800 dark:hover:text-emerald-300'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  transition={
                    motionProfile.reducedMotion
                      ? { duration: 0.12 }
                      : ANIMATION_SPRINGS.navPill
                  }
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 shadow-md shadow-emerald-900/20"
                  aria-hidden="true"
                />
              )}

              <motion.span
                variants={
                  motionProfile.reducedMotion
                    ? undefined
                    : {
                        hover: {
                          x: isActive ? 0 : 2,
                          rotate: isActive ? 0 : -7,
                          scale: 1.08,
                          transition: ANIMATION_SPRINGS.tactile,
                        },
                      }
                }
                className="relative z-10 inline-flex items-center justify-center shrink-0"
              >
                <Icon className="w-5 h-5" />
              </motion.span>

              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    key={`label-${item.id}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: scaledDuration(0.16) }}
                    className="relative z-10 truncate whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom Controls */}
      <div className="p-3 border-t border-emerald-950/10 dark:border-white/10 space-y-1.5">
        <PWAInstallButton
          variant="sidebar"
          collapsed={collapsed}
          logoUrl={schoolSettings.logoUrl}
        />

        <motion.button
          type="button"
          data-no-lift
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          whileTap={motionProfile.reducedMotion ? undefined : { scale: 0.97 }}
          className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <motion.span
            animate={{ rotate: collapsed ? 0 : 0 }}
            transition={ANIMATION_SPRINGS.tactile}
            className="inline-flex shrink-0"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 shrink-0" />
            )}
          </motion.span>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="collapse-label"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: scaledDuration(0.15) }}
                className="whitespace-nowrap"
              >
                Ciutkan Menu
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <motion.button
          type="button"
          data-no-lift
          onClick={onLogout}
          title={collapsed ? 'Keluar' : undefined}
          whileTap={motionProfile.reducedMotion ? undefined : { scale: 0.97 }}
          className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="logout-label"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: scaledDuration(0.15) }}
                className="whitespace-nowrap"
              >
                Keluar Akun
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  );
};
