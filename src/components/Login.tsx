import { ReactNode, useState, FormEvent } from "react";
import { AuthResponse } from "../types";
import { Shield, Lock, User as UserIcon, Eye, EyeOff, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import GestureDetector from "./GestureDetector";

interface LoginProps {
  onLogin: (user: AuthResponse) => void;
  onTriggerSOS: () => void;
}

export default function Login({ onLogin, onTriggerSOS }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [duressPin, setDuressPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegistering ? { username, password, duressPin } : { username, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      if (isRegistering) {
        setIsRegistering(false);
        setPassword("");
        setDuressPin("");
        setMessage("Profile created. Sign in with your 4-digit code or duress PIN.");
      } else {
        onLogin(data as AuthResponse);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white font-sans flex items-center justify-center">
      <GestureDetector onTrigger={onTriggerSOS} />

      {/* Ambient Radial Lighting Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.18),transparent_50%),radial-gradient(circle_at_90%_90%,rgba(59,130,246,0.12),transparent_40%),linear-gradient(180deg,#09090b_0%,#040405_100%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12 pointer-events-none w-full">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="pointer-events-auto w-full max-w-md rounded-[36px] border border-zinc-800/90 bg-zinc-900/90 p-8 shadow-[0_32px_96px_rgba(0,0,0,0.6)] backdrop-blur-2xl relative overflow-hidden"
        >
          {/* Accent Top Border Highlight */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

          <div className="mb-8">
            <div className="mb-5 flex h-13 w-13 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
              <Shield size={24} />
            </div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.35em] text-emerald-400">Silent Signal</p>
            <h1 className="mt-2 text-3xl font-serif font-bold tracking-tight text-white">
              {isRegistering ? "Create your access codes" : "Sign in quietly"}
            </h1>
            <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
              {isRegistering
                ? "Set one 4-digit code for normal access and one 4-digit duress PIN for silent emergency activation."
                : "Use your 4-digit passcode to open the decoy notes workspace silently."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username" icon={<UserIcon size={18} className="text-zinc-500" />}>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-13 w-full bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
                placeholder="Your private ID"
                required
              />
            </Field>

            <Field
              label={isRegistering ? "4-digit passcode" : "Passcode"}
              icon={<Lock size={18} className="text-zinc-500" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            >
              <input
                type={showPassword ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={password}
                onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-13 w-full bg-transparent text-white text-base tracking-[0.4em] outline-none placeholder:text-zinc-600 font-mono"
                placeholder="0000"
                required
              />
            </Field>

            <AnimatePresence>
              {isRegistering && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <Field label="4-digit duress PIN" icon={<Shield size={18} className="text-rose-400" />}>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      value={duressPin}
                      onChange={(event) => setDuressPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="h-13 w-full bg-transparent text-white text-base tracking-[0.4em] outline-none placeholder:text-zinc-600 font-mono"
                      placeholder="1111"
                      required={isRegistering}
                    />
                  </Field>
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-200">
                    💡 The duress PIN opens the normal-looking decoy notes while silently starting covert SOS tracking in background.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {message && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${
                  message.includes("Profile")
                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-400/20 bg-rose-500/10 text-rose-300"
                }`}
              >
                {message}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-60 shadow-md active:scale-98"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  {isRegistering ? "Create profile" : "Open notes"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3.5 text-xs text-zinc-400">
            <div>
              <p className="font-semibold text-zinc-200">{isRegistering ? "Already set up?" : "Need a new profile?"}</p>
              <p className="text-[10px] text-zinc-500">Switch mode without leaving screen.</p>
            </div>
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3.5 py-1.5 font-bold text-white transition-all hover:bg-zinc-700 active:scale-95 text-xs"
            >
              {isRegistering ? "Sign in" : "Register"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon,
  trailing,
  children,
}: {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 transition-all focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/10">
        {icon}
        <div className="flex-1">{children}</div>
        {trailing}
      </div>
    </label>
  );
}
