import { motion, AnimatePresence } from "motion/react";
import { RefreshCw } from "lucide-react";

interface ConfirmCountdownProps {
  active: boolean;
  secondsLeft: number;
  totalSeconds: number;
  onCancel: () => void;
}

/** Disguised as a cloud sync — not an obvious SOS countdown */
export default function ConfirmCountdown({
  active,
  secondsLeft,
  totalSeconds,
  onCancel,
}: ConfirmCountdownProps) {
  const progress = ((totalSeconds - secondsLeft) / totalSeconds) * 100;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-end justify-center pb-8 pointer-events-none"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.95 }}
            className="glass-card bg-white/95 backdrop-blur-xl border border-zinc-200/90 rounded-2xl shadow-2xl px-5 py-4 mx-4 max-w-sm w-full pointer-events-auto relative overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-xs">
                <RefreshCw size={18} className="animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">Syncing notes…</p>
                <p className="text-xs text-zinc-500 font-medium">Uploading changes to cloud vault</p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="mt-3.5 h-1.5 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/50">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-xs"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Hidden cancel — tap bottom-right corner */}
            <button
              type="button"
              aria-label="Cancel sync"
              onClick={onCancel}
              className="absolute bottom-0 right-0 w-14 h-14 opacity-0 cursor-pointer"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
