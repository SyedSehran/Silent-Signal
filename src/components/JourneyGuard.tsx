import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Navigation, Clock, ShieldCheck, X, Search, LoaderCircle, AlertTriangle } from "lucide-react";

interface JourneyGuardProps {
  latestLocation: { lat: number; lng: number } | null;
  onJourneyTimeout: () => void;
}

type Destination = {
  label: string;
  lat: number;
  lng: number;
};

type JourneyState = {
  destination: Destination;
  deadline: number; // epoch ms
  totalSeconds: number;
};

const ARRIVAL_RADIUS_METERS = 100;
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function JourneyGuard({ latestLocation, onJourneyTimeout }: JourneyGuardProps) {
  const [query, setQuery] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<Destination | null>(null);

  const [journey, setJourney] = useState<JourneyState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState<null | "arrived" | "safe" | "expired">(null);

  const firedRef = useRef(false);

  // tick every second while a journey is active
  useEffect(() => {
    if (!journey) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [journey]);

  const endJourney = useCallback((reason: "arrived" | "safe" | "expired") => {
    setJourney(null);
    setEnded(reason);
    if (reason === "expired" && !firedRef.current) {
      firedRef.current = true;
      onJourneyTimeout();
    }
  }, [onJourneyTimeout]);

  // deadline / arrival checks
  useEffect(() => {
    if (!journey) return;

    if (now >= journey.deadline) {
      endJourney("expired");
      return;
    }

    if (latestLocation) {
      const dist = haversineMeters(latestLocation, journey.destination);
      if (dist <= ARRIVAL_RADIUS_METERS) {
        endJourney("arrived");
      }
    }
  }, [now, journey, latestLocation, endJourney]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(null);
    try {
      const params = new URLSearchParams({
        q: query.trim(),
        format: "json",
        limit: "6",
        addressdetails: "0",
      });
      const res = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      const parsed: Destination[] = (data || [])
        .map((d: any) => ({
          label: d.display_name as string,
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        }))
        .filter((d: Destination) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
      if (!parsed.length) setSearchError("No matching places found.");
      setResults(parsed);
    } catch (e: any) {
      setSearchError(e?.message || "Search failed. Check your connection.");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const startJourney = useCallback(() => {
    if (!selected || minutes <= 0) return;
    firedRef.current = false;
    setEnded(null);
    setJourney({
      destination: selected,
      deadline: Date.now() + minutes * 60_000,
      totalSeconds: minutes * 60,
    });
  }, [selected, minutes]);

  // ---- Active journey view ----
  if (journey) {
    const remainingMs = journey.deadline - now;
    const dist = latestLocation
      ? haversineMeters(latestLocation, journey.destination)
      : null;
    const pct = Math.max(0, Math.min(100, (remainingMs / (journey.totalSeconds * 1000)) * 100));
    const urgent = remainingMs < 60_000;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className={`px-6 py-5 ${urgent ? "bg-red-600" : "bg-zinc-900"} text-white transition-colors`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-80">
              <Navigation size={14} className="animate-pulse" /> Journey in progress
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-70">Time remaining</div>
                <div className="font-mono text-5xl font-bold tabular-nums">{formatCountdown(remainingMs)}</div>
              </div>
              <Clock size={40} className="opacity-40" />
            </div>
            <div className="mt-4 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Destination</div>
                <div className="text-sm text-zinc-800 font-medium">{journey.destination.label}</div>
              </div>
            </div>

            <div className="text-sm text-zinc-600">
              {dist !== null ? (
                <span>
                  You are <strong>{dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}</strong> from your destination.
                  Arrival within {ARRIVAL_RADIUS_METERS} m auto-clears the alert.
                </span>
              ) : (
                <span className="text-amber-600">Waiting for GPS location…</span>
              )}
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              If the timer runs out before you arrive or tap "I'm safe", your trusted contacts will be alerted with your location.
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => endJourney("safe")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all active:scale-95"
              >
                <ShieldCheck size={18} /> I'm safe
              </button>
              <button
                onClick={() => endJourney("safe")}
                className="px-5 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
                title="Cancel journey without alerting anyone"
              >
                <X size={16} /> Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Setup view ----
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif font-bold text-2xl tracking-tight flex items-center gap-2">
          <Navigation size={22} /> Safe-Arrival Timer
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Set your destination and a time limit. If you don't arrive or confirm you're safe in time, your trusted contacts get alerted automatically.
        </p>
      </div>

      {ended && (
        <div
          className={`mb-5 rounded-xl p-3 text-sm font-medium border ${
            ended === "expired"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {ended === "arrived" && "You arrived safely — journey cleared, no alert sent."}
          {ended === "safe" && "Journey ended — no alert was sent."}
          {ended === "expired" && "Timer expired — an alert to your trusted contacts was triggered."}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">Destination</label>
          <div className="mt-2 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search an address or place…"
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-40 transition-all active:scale-95"
            >
              {searching ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>
          {searchError && <p className="mt-2 text-xs text-red-500">{searchError}</p>}
        </div>

        {results.length > 0 && (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {results.map((r, i) => {
              const isSel = selected?.lat === r.lat && selected?.lng === r.lng;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm flex gap-2 items-start transition-all ${
                    isSel
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700"
                  }`}
                >
                  <MapPin size={15} className="shrink-0 mt-0.5 opacity-70" />
                  <span className="leading-snug">{r.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div>
          <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            Time limit — {minutes} min
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={180}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="flex-1 accent-zinc-900"
            />
            <input
              type="number"
              min={1}
              max={720}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-center focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <div className="mt-2 flex gap-2">
            {[15, 30, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => setMinutes(m)}
                className="px-3 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-600 transition-all"
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={startJourney}
          disabled={!selected}
          className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <Navigation size={18} /> Start journey
        </button>
        {!selected && (
          <p className="text-center text-xs text-zinc-400 -mt-2">Search and select a destination to begin.</p>
        )}
      </div>
    </div>
  );
}
