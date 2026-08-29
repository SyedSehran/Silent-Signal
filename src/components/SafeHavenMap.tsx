import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapPin, Navigation, Shield, Phone, ExternalLink, Compass, Fuel, Building2, Cross, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

interface Location {
  lat: number;
  lng: number;
}

interface SafeHavenProps {
  latestLocation: Location | null;
  onStartEnRouteTracking?: () => void;
}

type HavenCategory = "ALL" | "POLICE" | "PHARMACY" | "PETROL" | "HOSPITAL";
type PlaceCategory = Exclude<HavenCategory, "ALL">;
type HavenStatus = "IDLE" | "LOADING" | "READY" | "EMPTY" | "ERROR";

// A real place resolved from OpenStreetMap (no distance yet — distance is
// computed live against the user's current coordinates).
interface RawPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  is24x7: boolean;
  notes: string;
}

// Free, key-less OpenStreetMap Overpass endpoints (CORS-enabled). We try them
// in order so a single mirror being down doesn't break the feature.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// How far out to look for real facilities (metres). Expanded automatically if
// the initial radius returns nothing.
const BASE_SEARCH_RADIUS = 3000;
const MAX_SEARCH_RADIUS = 15000;

const CATEGORY_META: Record<PlaceCategory, { osmAmenity: string; emergencyPhone: string; label: string }> = {
  POLICE: { osmAmenity: "police", emergencyPhone: "112", label: "Police Station" },
  PHARMACY: { osmAmenity: "pharmacy", emergencyPhone: "112", label: "Pharmacy" },
  PETROL: { osmAmenity: "fuel", emergencyPhone: "112", label: "Petrol Pump" },
  HOSPITAL: { osmAmenity: "hospital", emergencyPhone: "102", label: "Hospital" },
};

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

const GPS_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 25000,
  maximumAge: 3000,
};

function haversineMeters(a: Location, b: Location): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function amenityToCategory(amenity?: string): PlaceCategory | null {
  switch (amenity) {
    case "police":
      return "POLICE";
    case "pharmacy":
      return "PHARMACY";
    case "fuel":
      return "PETROL";
    case "hospital":
      return "HOSPITAL";
    default:
      return null;
  }
}

type OverpassTags = Record<string, string>;
interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OverpassTags;
}

function buildAddress(tags: OverpassTags): string {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] || tags["addr:neighbourhood"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (tags["addr:full"]) return tags["addr:full"];
  return "Address unlisted in OSM — use directions to navigate";
}

function buildNotes(category: PlaceCategory, tags: OverpassTags, is24x7: boolean): string {
  const openText = is24x7
    ? "Open 24/7"
    : tags.opening_hours
    ? `Hours: ${tags.opening_hours}`
    : "Verify opening hours before heading out";
  switch (category) {
    case "POLICE":
      return `${openText}. Staffed police facility — report to the duty officer.`;
    case "PHARMACY":
      return `${openText}. Well-lit, public chemist — safe to wait inside.`;
    case "PETROL":
      return `${openText}. Fuel station usually has attendants & CCTV.`;
    case "HOSPITAL":
      return `${openText}. Hospital with reception/security available.`;
    default:
      return openText;
  }
}

function buildOverpassQuery(loc: Location, radius: number): string {
  const parts = Object.values(CATEGORY_META)
    .map(
      (m) =>
        `node["amenity"="${m.osmAmenity}"](around:${radius},${loc.lat},${loc.lng});` +
        `way["amenity"="${m.osmAmenity}"](around:${radius},${loc.lat},${loc.lng});`
    )
    .join("");
  return `[out:json][timeout:25];(${parts});out center tags;`;
}

function parseElements(elements: OverpassElement[]): RawPlace[] {
  const out: RawPlace[] = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const category = amenityToCategory(tags.amenity);
    if (!category) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const meta = CATEGORY_META[category];
    const is24x7 = (tags.opening_hours || "").replace(/\s/g, "").toLowerCase() === "24/7";
    const phone = tags.phone || tags["contact:phone"] || tags["contact:mobile"] || meta.emergencyPhone;
    const name = tags.name || tags["name:en"] || tags.operator || `Nearest ${meta.label}`;

    out.push({
      id: `${el.type}-${el.id}`,
      name,
      category,
      address: buildAddress(tags),
      phone,
      lat,
      lng,
      is24x7,
      notes: buildNotes(category, tags, is24x7),
    });
  }
  return out;
}

export default function SafeHavenMap({ latestLocation, onStartEnRouteTracking }: SafeHavenProps) {
  const [liveGps, setLiveGps] = useState<Location | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"ACQUIRING" | "HIGH_ACCURACY" | "UNAVAILABLE">("ACQUIRING");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HavenCategory>("ALL");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isEnRouteTracking, setIsEnRouteTracking] = useState(false);

  const [rawPlaces, setRawPlaces] = useState<RawPlace[]>([]);
  const [havenStatus, setHavenStatus] = useState<HavenStatus>("IDLE");
  const [havenError, setHavenError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef<Location | null>(null);

  const applyGpsPosition = useCallback((pos: GeolocationPosition) => {
    setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setGpsAccuracy(pos.coords.accuracy ?? null);
    setGpsStatus("HIGH_ACCURACY");
    setGpsError(null);
  }, []);

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    console.warn("GPS error:", err);
    setGpsStatus((prev) => (prev === "HIGH_ACCURACY" ? prev : "UNAVAILABLE"));
    if (err.code === err.PERMISSION_DENIED) {
      setGpsError("Location permission denied. Enable GPS/location access in your browser settings.");
    } else if (err.code === err.TIMEOUT) {
      setGpsError("GPS timed out. Move to an open area and tap refresh.");
    } else {
      setGpsError("Unable to determine your location. Check that location services are enabled.");
    }
  }, []);

  const refreshHighAccuracyGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("UNAVAILABLE");
      setGpsError("Geolocation is not supported by this browser.");
      return;
    }
    setGpsStatus("ACQUIRING");
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(applyGpsPosition, handleGpsError, GPS_OPTIONS);
  }, [applyGpsPosition, handleGpsError]);

  useEffect(() => {
    refreshHighAccuracyGps();
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(applyGpsPosition, handleGpsError, GPS_WATCH_OPTIONS);
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [refreshHighAccuracyGps, applyGpsPosition, handleGpsError]);

  const userCoords = useMemo<Location | null>(() => liveGps || latestLocation, [liveGps, latestLocation]);

  // Query real facilities from OpenStreetMap around the given coordinates.
  // Expands the search radius until it finds something (or hits the cap).
  const fetchNearbyHavens = useCallback(async (loc: Location) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setHavenStatus("LOADING");
    setHavenError(null);

    try {
      let radius = BASE_SEARCH_RADIUS;
      while (radius <= MAX_SEARCH_RADIUS) {
        const query = buildOverpassQuery(loc, radius);
        let json: { elements?: OverpassElement[] } | null = null;
        let lastErr: unknown = null;

        for (const endpoint of OVERPASS_ENDPOINTS) {
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: "data=" + encodeURIComponent(query),
            });
            if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
            json = await res.json();
            break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (!json) throw lastErr ?? new Error("All Overpass endpoints failed");

        const parsed = parseElements(json.elements || []);
        if (parsed.length > 0) {
          setRawPlaces(parsed);
          setHavenStatus("READY");
          return;
        }
        radius *= 2; // widen and try again
      }
      setRawPlaces([]);
      setHavenStatus("EMPTY");
    } catch (e) {
      console.warn("Overpass fetch failed", e);
      setHavenStatus("ERROR");
      setHavenError("Could not load live nearby safe zones. Check your connection and tap refresh.");
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Auto-fetch when we first get a location, or after the user has moved a
  // meaningful distance (>400m) so the list stays relevant without spamming.
  useEffect(() => {
    if (!userCoords) return;
    const last = lastFetchRef.current;
    const moved = !last || haversineMeters(last, userCoords) > 400;
    if (moved) {
      lastFetchRef.current = userCoords;
      fetchNearbyHavens(userCoords);
    }
  }, [userCoords, fetchNearbyHavens]);

  const handleManualRefresh = useCallback(() => {
    refreshHighAccuracyGps();
    const target = userCoords;
    if (target) {
      lastFetchRef.current = target;
      fetchNearbyHavens(target);
    }
  }, [refreshHighAccuracyGps, userCoords, fetchNearbyHavens]);

  // Compute real distances against the user's live position, then keep the
  // nearest few per category so the list stays focused on the closest options.
  const placesWithDistances = useMemo(() => {
    if (!userCoords) return [];
    const withDist = rawPlaces.map((p) => {
      const distanceMeters = Math.round(haversineMeters(userCoords, { lat: p.lat, lng: p.lng }));
      return { ...p, distanceMeters, walkTimeMins: Math.max(1, Math.ceil(distanceMeters / 75)) };
    });
    withDist.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const perCategoryCount: Record<string, number> = {};
    const limited: typeof withDist = [];
    for (const p of withDist) {
      const count = perCategoryCount[p.category] ?? 0;
      if (count < 4) {
        perCategoryCount[p.category] = count + 1;
        limited.push(p);
      }
    }
    return limited;
  }, [rawPlaces, userCoords]);

  const filteredPlaces = useMemo(() => {
    if (selectedCategory === "ALL") return placesWithDistances;
    return placesWithDistances.filter((p) => p.category === selectedCategory);
  }, [placesWithDistances, selectedCategory]);

  const nearestHaven = placesWithDistances[0] ?? null;
  const radarMaxDist = useMemo(() => {
    const max = placesWithDistances.reduce((m, p) => Math.max(m, p.distanceMeters), 0);
    return Math.max(max, 500);
  }, [placesWithDistances]);

  const formatDistance = (meters: number) => (meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`);

  const getCategoryIcon = (category: HavenCategory) => {
    switch (category) {
      case "POLICE":
        return <Shield className="w-4 h-4 text-blue-600" />;
      case "PHARMACY":
        return <Cross className="w-4 h-4 text-emerald-600" />;
      case "PETROL":
        return <Fuel className="w-4 h-4 text-amber-600" />;
      case "HOSPITAL":
        return <Building2 className="w-4 h-4 text-rose-600" />;
      default:
        return <MapPin className="w-4 h-4 text-zinc-600" />;
    }
  };

  const getCategoryBadgeClass = (category: HavenCategory) => {
    switch (category) {
      case "POLICE":
        return "bg-blue-50/90 text-blue-700 border-blue-200/90";
      case "PHARMACY":
        return "bg-emerald-50/90 text-emerald-700 border-emerald-200/90";
      case "PETROL":
        return "bg-amber-50/90 text-amber-700 border-amber-200/90";
      case "HOSPITAL":
        return "bg-rose-50/90 text-rose-700 border-rose-200/90";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  const handleOpenDirections = useCallback(
    (place: { lat: number; lng: number }) => {
      const openMaps = (origin: Location | null) => {
        const originParam = origin ? `origin=${origin.lat},${origin.lng}&` : "";
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&${originParam}destination=${place.lat},${place.lng}&travelmode=walking`;
        window.open(mapsUrl, "_blank", "noopener,noreferrer");
      };

      if (userCoords) {
        openMaps(userCoords);
        return;
      }
      if (!("geolocation" in navigator)) {
        openMaps(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => openMaps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => openMaps(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    [userCoords]
  );

  const handleSelectPlace = (place: (typeof placesWithDistances)[number]) => {
    setSelectedPlaceId(place.id);
    handleOpenDirections(place);
  };

  const listStatusMessage =
    havenStatus === "LOADING"
      ? "Scanning OpenStreetMap for the real nearest police, pharmacy, petrol & hospital around you…"
      : havenStatus === "EMPTY"
      ? "No verified facilities found nearby in OpenStreetMap. Try again from a different spot."
      : havenStatus === "ERROR"
      ? havenError
      : !userCoords
      ? "Waiting for your location to find the exact nearest safe zones…"
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 glass-card p-7 rounded-[32px] border border-zinc-200/90 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-2 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1.5 shadow-xs">
              <Compass size={13} className="animate-spin text-emerald-600" /> Live OSM Safe Zones
            </span>

            {gpsStatus === "HIGH_ACCURACY" && userCoords && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900 text-emerald-400 border border-zinc-800 flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                GPS Active ({userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)})
                {gpsAccuracy != null && ` ±${Math.round(gpsAccuracy)}m`}
              </span>
            )}

            {gpsStatus === "ACQUIRING" && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin text-amber-600" /> Locating...
              </span>
            )}

            {gpsStatus === "UNAVAILABLE" && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 border border-rose-500/20 flex items-center gap-1.5">
                <AlertTriangle size={11} /> GPS Unavailable
              </span>
            )}

            {havenStatus === "LOADING" && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin text-emerald-600" /> Finding real places…
              </span>
            )}
          </div>

          <h2 className="text-3xl md:text-4xl font-serif font-bold text-zinc-900 tracking-tight">Safe Haven Radar</h2>
          <p className="text-zinc-500 text-sm max-w-2xl leading-relaxed">
            Real-time navigation to the exact nearest verified facilities — police stations, pharmacies, petrol pumps and hospitals — sourced live from OpenStreetMap around your actual GPS position.
          </p>

          {gpsError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 max-w-2xl">
              {gpsError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0 z-10 pt-2 xl:pt-0">
          <button
            onClick={handleManualRefresh}
            className="p-3 bg-white hover:bg-zinc-100 text-zinc-700 rounded-2xl border border-zinc-200/90 transition-all shadow-xs"
            title="Refresh GPS & re-scan nearest real facilities"
          >
            <RefreshCw size={16} className={gpsStatus === "ACQUIRING" || havenStatus === "LOADING" ? "animate-spin" : ""} />
          </button>

          {nearestHaven && (
            <button
              onClick={() => {
                setIsEnRouteTracking(true);
                handleOpenDirections(nearestHaven);
                if (onStartEnRouteTracking) onStartEnRouteTracking();
              }}
              className={`px-5 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
                isEnRouteTracking
                  ? "bg-emerald-600 text-white shadow-emerald-600/25 glow-emerald"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {isEnRouteTracking ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-200" /> En-Route Guard Active
                </>
              ) : (
                <>
                  <Navigation size={16} /> Navigate Nearest ({formatDistance(nearestHaven.distanceMeters)})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {havenStatus === "ERROR" && havenError && (
        <div className="glass-card p-4 rounded-[24px] border border-amber-200/90 bg-amber-50/50 text-xs text-amber-800 flex items-center justify-between gap-3">
          <span>{havenError}</span>
          <button
            onClick={handleManualRefresh}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold shrink-0 hover:bg-amber-700 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 glass-card-dark text-white p-7 rounded-[32px] border border-zinc-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between z-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live GPS Radar</p>
                <h3 className="text-xl font-bold text-white mt-0.5">{formatDistance(radarMaxDist)} Nearest-Zone Range</h3>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono font-bold">
                {gpsStatus === "HIGH_ACCURACY" ? "GPS Active" : "Localizing..."}
              </span>
            </div>

            <div className="my-6 relative h-72 rounded-3xl bg-zinc-950/90 border border-zinc-800/80 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute w-56 h-56 rounded-full border border-emerald-500/20" />
              <div className="absolute w-40 h-40 rounded-full border border-emerald-500/25" />
              <div className="absolute w-24 h-24 rounded-full border border-zinc-800" />

              <span className="absolute top-3 text-[9px] font-mono text-zinc-600">{formatDistance(radarMaxDist)}</span>
              <span className="absolute top-14 text-[9px] font-mono text-zinc-600">{formatDistance(Math.round(radarMaxDist / 2))}</span>

              <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(16,185,129,0.22)_0deg,transparent_60deg)] animate-[spin_6s_linear_infinite]" />

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_16px_rgba(52,211,153,0.9)] border-2 border-zinc-950 animate-pulse" />
                <span className="text-[9px] font-extrabold text-emerald-300 mt-1 bg-zinc-900/90 px-2 py-0.5 rounded-full border border-zinc-800 tracking-wider">YOU</span>
              </div>

              {placesWithDistances.map((place, idx) => {
                const angleDeg = idx * 47 - 50;
                const angleRad = angleDeg * (Math.PI / 180);
                const normalizedDist = Math.min(1, place.distanceMeters / radarMaxDist);
                const radiusPixels = 30 + normalizedDist * 78;
                const x = Math.cos(angleRad) * radiusPixels;
                const y = Math.sin(angleRad) * radiusPixels;
                const isSelected = selectedPlaceId === place.id;

                return (
                  <button
                    key={place.id}
                    onClick={() => handleSelectPlace(place)}
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                    className={`absolute z-20 transition-all duration-300 flex items-center gap-1.5 p-1 rounded-full group ${
                      isSelected ? "scale-115 z-30" : "hover:scale-110"
                    }`}
                    title={`${place.name} (${formatDistance(place.distanceMeters)})`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full transition-all ${
                        isSelected
                          ? "bg-amber-400 ring-4 ring-amber-400/40 glow-amber"
                          : "bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                      }`}
                    />
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md transition-all border ${
                        isSelected
                          ? "bg-amber-400 text-zinc-950 border-amber-400 shadow-sm"
                          : "bg-zinc-900/90 text-zinc-300 border-zinc-800 opacity-80 group-hover:opacity-100"
                      }`}
                    >
                      {formatDistance(place.distanceMeters)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="z-10 bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between text-xs backdrop-blur-sm">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0 pr-2">
                <MapPin size={15} className="text-emerald-400 shrink-0" />
                <span className="truncate">
                  Nearest: <strong className="text-white font-semibold">{nearestHaven?.name ?? "Searching…"}</strong>
                </span>
              </div>
              {nearestHaven && (
                <span className="font-mono text-emerald-400 font-bold shrink-0 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {formatDistance(nearestHaven.distanceMeters)}
                </span>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {(["ALL", "POLICE", "PHARMACY", "PETROL", "HOSPITAL"] as HavenCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 shadow-xs ${
                    selectedCategory === cat
                      ? "bg-zinc-900 text-white shadow-md"
                      : "bg-white text-zinc-600 border border-zinc-200/90 hover:bg-zinc-50"
                  }`}
                >
                  {cat === "ALL" && <Compass size={14} />}
                  {cat === "POLICE" && <Shield size={14} className="text-blue-500" />}
                  {cat === "PHARMACY" && <Cross size={14} className="text-emerald-500" />}
                  {cat === "PETROL" && <Fuel size={14} className="text-amber-500" />}
                  {cat === "HOSPITAL" && <Building2 size={14} className="text-rose-500" />}
                  <span>{cat === "ALL" ? "All Nearby Zones" : cat.charAt(0) + cat.slice(1).toLowerCase()}</span>
                </button>
              ))}
            </div>

            {listStatusMessage && (
              <div className="glass-card p-8 rounded-[24px] border border-zinc-200/90 flex flex-col items-center justify-center text-center gap-3">
                {havenStatus === "LOADING" ? (
                  <RefreshCw size={22} className="animate-spin text-emerald-600" />
                ) : havenStatus === "ERROR" ? (
                  <AlertTriangle size={22} className="text-amber-600" />
                ) : (
                  <Compass size={22} className="text-zinc-400 animate-spin" />
                )}
                <p className="text-sm text-zinc-500 max-w-md">{listStatusMessage}</p>
              </div>
            )}

            {filteredPlaces.length === 0 && !listStatusMessage && havenStatus === "READY" && (
              <div className="glass-card p-8 rounded-[24px] border border-zinc-200/90 text-center text-sm text-zinc-500">
                No {selectedCategory.toLowerCase()} facilities found nearby. Try another category.
              </div>
            )}

            <div className="space-y-4">
              {filteredPlaces.map((place) => {
                const isSelected = selectedPlaceId === place.id;
                return (
                  <motion.div
                    key={place.id}
                    layout
                    onClick={() => handleSelectPlace(place)}
                    className={`glass-card p-6 rounded-[24px] border transition-all cursor-pointer hover-lift ${
                      isSelected ? "border-emerald-500 ring-2 ring-emerald-500/15" : "border-zinc-200/90 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider flex items-center gap-1 ${getCategoryBadgeClass(place.category)}`}
                          >
                            {getCategoryIcon(place.category)}
                            {place.category}
                          </span>
                          {place.is24x7 && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              ⚡ 24/7 OPEN
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                            {formatDistance(place.distanceMeters)} away (~{place.walkTimeMins} min walk)
                          </span>
                        </div>

                        <h4 className="text-lg font-bold text-zinc-900 mt-1 tracking-tight">{place.name}</h4>
                        <p className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                          <MapPin size={13} className="text-zinc-400" />
                          {place.address}
                        </p>
                        <p className="text-xs text-zinc-600 bg-zinc-50/80 p-2.5 rounded-xl border border-zinc-100 mt-2 font-sans">
                          💡 {place.notes}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:flex-col sm:items-end justify-end shrink-0 pt-2 sm:pt-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDirections(place);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                        >
                          <Navigation size={14} /> Walk Directions <ExternalLink size={12} />
                        </button>

                        <a
                          href={`tel:${place.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center gap-1.5 transition-all"
                        >
                          <Phone size={14} className="text-zinc-600" /> Call
                        </a>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
    </div>
  );
}

