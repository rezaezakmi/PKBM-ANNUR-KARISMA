import React from 'react';
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="no-print fixed bottom-20 md:bottom-4 left-4 right-4 sm:right-auto z-[110] inline-flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xl"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Mode Offline — Menampilkan data tersimpan sementara sambil menunggu sinyal.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
