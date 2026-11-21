import React, { useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { LogOut, MoreHorizontal, X } from 'lucide-react';
import { getNavItemsForRole } from '../../config/navigation';
import { ANIMATION_SPRINGS, useAdaptiveMotion } from '../../config/animations';
import { PageRoute, UserRole } from '../../types/siakad';

interface BottomNavProps {
  activeRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  role: UserRole;
  onLogout: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeRoute,
  onNavigate,
  role,
  onLogout,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const motionProfile = useAdaptiveMotion();
  const items = getNavItemsForRole(role);

  const primaryItems = items.slice(0, 4);
  const extraItems = items.slice(4);
  const isExtraActive = extraItems.some((e) => e.id === activeRoute);

  const handleSheetDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 350) {
      setDrawerOpen(false);
    }
  };

  return (
    <>
      <nav
        aria-label="Navigasi bawah seluler"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-emerald-950/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md grid grid-cols-5 items-center px-1"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-no-lift
              onClick={() => {
                onNavigate(item.id);
                setDrawerOpen(false);
              }}
              className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                isActive
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <motion.span
                animate={
                  motionProfile.reducedMotion
                    ? undefined
                    : { y: isActive ? -2.5 : 0, scale: isActive ? 1.12 : 1 }
                }
                transition={ANIMATION_SPRINGS.tactile}
                className="inline-flex items-center justify-center"
              >
                <Icon className="w-5 h-5" />
              </motion.span>
              <span className="text-[10px] tracking-tight truncate max-w-[64px]">
                {item.shortLabel}
              </span>
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active-dot"
                  transition={
                    motionProfile.reducedMotion ? { duration: 0.1 } : ANIMATION_SPRINGS.navPill
                  }
                  className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-amber-500"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}

        <button
          type="button"
          data-no-lift
          onClick={() => setDrawerOpen(true)}
          className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
            isExtraActive
              ? 'text-emerald-700 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <motion.span
            animate={
              motionProfile.reducedMotion
                ? undefined
                : { y: isExtraActive ? -2.5 : 0, scale: isExtraActive ? 1.12 : 1 }
            }
            transition={ANIMATION_SPRINGS.tactile}
            className="inline-flex items-center justify-center"
          >
            <MoreHorizontal className="w-5 h-5" />
          </motion.span>
          <span className="text-[10px] tracking-tight">Lainnya</span>
          {isExtraActive && (
            <motion.span
              layoutId="bottom-nav-active-dot"
              transition={
                motionProfile.reducedMotion ? { duration: 0.1 } : ANIMATION_SPRINGS.navPill
              }
              className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-amber-500"
              aria-hidden="true"
            />
          )}
        </button>
      </nav>

      {/* Mobile "Lainnya" Swipe-to-Dismiss Bottom Sheet */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="no-print md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-slate-950/50"
            />
            <motion.div
              initial={motionProfile.reducedMotion ? { opacity: 0 } : { y: '100%' }}
              animate={motionProfile.reducedMotion ? { opacity: 1 } : { y: 0 }}
              exit={motionProfile.reducedMotion ? { opacity: 0 } : { y: '100%' }}
              transition={
                motionProfile.reducedMotion ? { duration: 0.15 } : ANIMATION_SPRINGS.sheet
              }
              drag={motionProfile.reducedMotion ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.55 }}
              onDragEnd={handleSheetDragEnd}
              className="relative z-10 max-h-[82vh] flex flex-col rounded-t-3xl bg-white dark:bg-slate-900 border-t border-emerald-950/10 dark:border-white/10 pt-4 px-5 pb-6 shadow-2xl"
            >
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 shrink-0 cursor-grab" />
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Menu Lainnya
                </h3>
                <button
                  type="button"
                  data-no-lift
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Tutup menu"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 overflow-y-auto overscroll-contain pb-2 -mx-1 px-1">
                {extraItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeRoute === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-no-lift
                      onClick={() => {
                        onNavigate(item.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-700 to-amber-600 text-white font-semibold'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  data-no-lift
                  onClick={() => {
                    setDrawerOpen(false);
                    onLogout();
                  }}
                  className="w-full min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 mt-3"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span>Keluar Akun</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
