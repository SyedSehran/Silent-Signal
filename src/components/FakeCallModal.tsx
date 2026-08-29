import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, ShieldAlert, X, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface FakeCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEscalateSOS: () => void;
}

export type CallerPreset = "Mom" | "Dad" | "Office Manager" | "Ride Support" | "Apartment Security";

const CALLER_PROMPTS: Record<CallerPreset, { number: string; dialog: string }> = {
  Mom: {
    number: "+1 (555) 234-8891",
    dialog: "Hey, where are you right now? I'm waiting outside with the car. Stay on the phone with me until you walk over.",
  },
  Dad: {
    number: "+1 (555) 456-1200",
    dialog: "Hey kiddo! I'm parked right near the front gate with hazard lights on. Come out right now.",
  },
  "Office Manager": {
    number: "+1 (555) 890-3344",
    dialog: "Hi, this is corporate security checking in. We've dispatched local patrol to your coordinates. Please remain on the line.",
  },
  "Ride Support": {
    number: "+1 (800) 555-0199",
    dialog: "Hello, your priority cab driver is arriving in 30 seconds at your location. Please step to the main street.",
  },
  "Apartment Security": {
    number: "+1 (555) 777-9090",
    dialog: "Good evening, security desk here. We see you on CCTV and the lobby officer is standing by outside for you.",
  },
};

export default function FakeCallModal({ isOpen, onClose, onEscalateSOS }: FakeCallModalProps) {
  const [caller, setCaller] = useState<CallerPreset>("Mom");
  const [callState, setCallState] = useState<"RINGING" | "CONNECTED" | "ENDED">("RINGING");
  const [secondsConnected, setSecondsConnected] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [muteTapCount, setMuteTapCount] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringOsc1Ref = useRef<OscillatorNode | null>(null);
  const ringOsc2Ref = useRef<OscillatorNode | null>(null);
  const ringGainRef = useRef<GainNode | null>(null);
  const ringIntervalRef = useRef<number | null>(null);

  // Initialize Web Audio Synth Ringtone
  const startRingtone = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const playPulse = () => {
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc2.type = "sine";
        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        osc2.frequency.setValueAtTime(480, ctx.currentTime);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 1.8);
        osc2.stop(ctx.currentTime + 1.8);

        ringOsc1Ref.current = osc1;
        ringOsc2Ref.current = osc2;
        ringGainRef.current = gain;
      };

      playPulse();
      ringIntervalRef.current = window.setInterval(playPulse, 3000);
    } catch {
      // Audio context fallbacks
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  // Web Speech API Dialog Synthesizer
  const speakDialog = useCallback((text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCallState("RINGING");
      setSecondsConnected(0);
      setMuteTapCount(0);
      startRingtone();
    } else {
      stopRingtone();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    }
    return () => {
      stopRingtone();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, [isOpen, startRingtone, stopRingtone]);

  useEffect(() => {
    let interval: number | null = null;
    if (callState === "CONNECTED") {
      interval = window.setInterval(() => {
        setSecondsConnected((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  if (!isOpen) return null;

  const handleAcceptCall = () => {
    stopRingtone();
    setCallState("CONNECTED");
    speakDialog(CALLER_PROMPTS[caller].dialog);
  };

  const handleDeclineCall = () => {
    stopRingtone();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setCallState("ENDED");
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleMuteClick = () => {
    setIsMuted(!isMuted);
    const nextCount = muteTapCount + 1;
    setMuteTapCount(nextCount);
    if (nextCount >= 3) {
      onEscalateSOS();
      onClose();
    }
  };

  const formatTimer = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-sm bg-gradient-to-b from-zinc-900 via-zinc-950 to-black text-white rounded-[36px] shadow-2xl overflow-hidden border border-zinc-800 relative flex flex-col justify-between min-h-[580px] p-6 text-center"
        >
          {/* Header & Close */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1 bg-zinc-800/80 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase text-emerald-400">
              ⚡ Distraction Call
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-full bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Caller Preset Selector (when ringing) */}
          {callState === "RINGING" && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 bg-zinc-900/80 p-2 rounded-2xl border border-zinc-800">
              {(Object.keys(CALLER_PROMPTS) as CallerPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setCaller(p)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${
                    caller === p
                      ? "bg-emerald-500 text-black font-extrabold"
                      : "text-zinc-400 hover:text-white bg-zinc-800/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Caller Identity */}
          <div className="my-auto space-y-4">
            <div className="relative mx-auto w-24 h-24 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center shadow-xl">
              <User size={48} className="text-zinc-400" />
              {callState === "RINGING" && (
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-50" />
              )}
            </div>

            <div>
              <h3 className="text-2xl font-bold text-white">{caller}</h3>
              <p className="text-xs font-mono text-zinc-400 mt-1">{CALLER_PROMPTS[caller].number}</p>
              <p className="text-xs font-bold uppercase tracking-widest mt-2 text-emerald-400">
                {callState === "RINGING" && "Incoming Mobile Call..."}
                {callState === "CONNECTED" && formatTimer(secondsConnected)}
                {callState === "ENDED" && "Call Ended"}
              </p>
            </div>
          </div>

          {/* Active Call Controls */}
          {callState === "CONNECTED" && (
            <div className="space-y-6 my-4">
              <div className="grid grid-cols-2 gap-4 max-w-[240px] mx-auto">
                <button
                  onClick={handleMuteClick}
                  className={`p-4 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-xs font-bold border ${
                    isMuted
                      ? "bg-white text-zinc-950 border-white"
                      : "bg-zinc-800/80 text-white border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  <span>{isMuted ? "Muted" : "Mute"}</span>
                </button>

                <button
                  onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  className={`p-4 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-xs font-bold border ${
                    isSpeakerOn
                      ? "bg-emerald-500 text-black border-emerald-500 font-extrabold"
                      : "bg-zinc-800/80 text-white border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  <Volume2 size={20} />
                  <span>Speaker</span>
                </button>
              </div>

              <div className="bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-rose-400 font-semibold text-[11px]">
                  <ShieldAlert size={14} /> Triple-tap Mute = Covert SOS
                </span>
                <span className="text-[10px] text-zinc-500">Taps: {muteTapCount}/3</span>
              </div>
            </div>
          )}

          {/* Call Action Buttons */}
          <div className="pt-4">
            {callState === "RINGING" ? (
              <div className="flex items-center justify-around gap-6">
                <button
                  onClick={handleDeclineCall}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-transform group-active:scale-95">
                    <PhoneOff size={28} />
                  </div>
                  <span className="text-xs font-bold text-zinc-400">Decline</span>
                </button>

                <button
                  onClick={handleAcceptCall}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-black shadow-lg shadow-emerald-500/30 transition-transform group-active:scale-95 animate-bounce">
                    <Phone size={28} />
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Accept</span>
                </button>
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  onClick={handleDeclineCall}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 mx-auto"
                  title="End Call"
                >
                  <PhoneOff size={28} />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
