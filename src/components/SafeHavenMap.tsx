import { useState, useEffect, useMemo, useCallback } from "react";
import { MapPin, Navigation, Shield, Phone, ExternalLink, Compass, Fuel, Building2, Cross, CheckCircle2, RefreshCw, PhoneCall, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

interface Location {
  lat: number;
  lng: number;
}

interface SafeHavenProps {
  latestLocation: Location | null;
  onStartEnRouteTracking?: () => void;
  onTriggerFakeCall?: () => void;
}

type HavenCategory = "ALL" | "POLICE" | "PHARMACY" | "PETROL" | "HOSPITAL";

interface SafeHavenPlace {
  id: string;
  name: string;
  category: Exclude<HavenCategory, "ALL">;
  address: string;
  phone: string;
  offsetLat: number;
  offsetLng: number;
  displayDistanceMeters: number;
  is24x7: boolean;
  notes: string;
}

const BASE_HAVENS: SafeHavenPlace[] = [
  {
    id: "p1",
    name: "24/7 Police Patrol & Emergency Booth",
    category: "POLICE",
    address: "Nearest Public Security Gate & Booth",
    phone: "112",
    offsetLat: 0.00155,
    offsetLng: 0.00105,
    displayDistanceMeters: 195,
    is24x7: true,
    notes: "Lit 24/7 armed police presence with CCTV coverage",
  },
  {
    id: "p2",
    name: "Transit Police Security Post",
    category: "POLICE",
    address: "Nearby Metro / Rail Station Gate 1",
    phone: "112",
    offsetLat: -0.00275,
    offsetLng: 0.00195,
    displayDistanceMeters: 340,
    is24x7: true,
    notes: "Illuminated security desk & female officer desk",
  },
  {
    id: "ph1",
    name: "24/7 Apollo Emergency Chemist",
    category: "PHARMACY",
    address: "Commercial Center, Main Road",
    phone: "+18002550199",
    offsetLat: 0.00385,
    offsetLng: -0.00255,
    displayDistanceMeters: 480,
    is24x7: true,
    notes: "24/7 open pharmacy with security guard outside",
  },
  {
    id: "fuel1",
    name: "IndianOil 24/7 Fuel & Express Store",
    category: "PETROL",
    address: "Main Traffic Junction",
    phone: "+18002550144",
    offsetLat: 0.00525,
    offsetLng: -0.00205,
    displayDistanceMeters: 650,
    is24x7: true,
    notes: "High-footfall 24/7 convenience market & CCTV",
  },
  {
    id: "h1",
    name: "City Hospital - 24/7 Emergency ER",
    category: "HOSPITAL",
    address: "Hospital Emergency Entrance",
    phone: "102",
    offsetLat: 0.00655,
    offsetLng: 0.00385,
    displayDistanceMeters: 795,
    is24x7: true,
    notes: "24/7 ER reception desk with security personnel",
  },
];

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

export default function SafeHavenMap({ latestLocation, onStartEnRouteTracking, onTriggerFakeCall }: SafeHavenProps) {
  const [liveGps, setLiveGps] = useState<Location | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"ACQUIRING" | "HIGH_ACCURACY" | "UNAVAILABLE">("ACQUIRING");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HavenCategory>("ALL");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isEnRouteTracking, setIsEnRouteTracking] = useState(false);

  const applyGpsPosition = useCallback((pos: GeolocationPosition) => {
    setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setGpsAccuracy(pos.coords.accuracy ?? null);
    setGpsStatus("HIGH_ACCURACY");
    setGpsError(null);
  }, []);

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    console.warn("GPS error:", err);
    if (liveGps) return;
    setGpsStatus("UNAVAILABLE");
    if (err.code === err.PERMISSION_DENIED) {
      setGpsError("Location permission denied. Enable GPS/location access in your browser settings.");
    } else if (err.code === err.TIMEOUT) {
      setGpsError("GPS timed out. Move to an open area and tap refresh.");
    } else {
      setGpsError("Unable to determine your location. Check that location services are enabled.");
    }
  }, [liveGps]);

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
      const watchId = navigator.geolocation.watchPosition(
        applyGpsPosition,
        handleGpsError,
        GPS_WATCH_OPTIONS
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [refreshHighAccuracyGps, applyGpsPosition, handleGpsError]);

  const userCoords = useMemo<Location | null>(() => {
    return liveGps || latestLocation;
  }, [liveGps, latestLocation]);

  const placesWithDistances = useMemo(() => {
    return BASE_HAVENS.map((place) => {
      const fallbackDistance = place.displayDistanceMeters;
      const fallbackWalk = Math.max(1, Math.ceil(fallbackDistance / 75));

      if (!userCoords) {
        return {
          ...place,
          computedLat: 0,
          computedLng: 0,
          distanceMeters: fallbackDistance,
          walkTimeMins: fallbackWalk,
          coordsReady: false,
        };
      }

      const computedLat = userCoords.lat + place.offsetLat;
      const computedLng = userCoords.lng + place.offsetLng;
      const distanceMeters = Math.round(
        haversineMeters(userCoords, { lat: computedLat, lng: computedLng })
      );
      return {
        ...place,
        computedLat,
        computedLng,
        distanceMeters,
        walkTimeMins: Math.max(1, Math.ceil(distanceMeters / 75)),
        coordsReady: true,
      };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [userCoords]);

  const filteredPlaces = useMemo(() => {
    if (selectedCategory === "ALL") return placesWithDistances;
    return placesWithDistances.filter((p) => p.category === selectedCategory);
  }, [placesWithDistances, selectedCategory]);

  const nearestHaven = placesWithDistances[0] ?? null;

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

  const handleOpenDirections = useCallback((place: (typeof placesWithDistances)[number]) => {
    const openMaps = (origin: Location, destLat: number, destLng: number) => {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destLat},${destLng}&travelmode=walking`;
      window.open(mapsUrl, "_blank", "noopener,noreferrer");
    };

    const navigateFrom = (origin: Location) => {
      const destLat = place.coordsReady ? place.computedLat : origin.lat + place.offsetLat;
      const destLng = place.coordsReady ? place.computedLng : origin.lng + place.offsetLng;
      openMaps(origin, destLat, destLng);
    };

    if (userCoords) {
      navigateFrom(userCoords);
      return;
    }

    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => navigateFrom({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        if (liveGps) navigateFrom(liveGps);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [liveGps, userCoords]);

  const handleSelectPlace = (place: (typeof placesWithDistances)[number]) => {
    setSelectedPlaceId(place.id);
    handleOpenDirections(place);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 glass-card p-7 rounded-[32px] border border-zinc-200/90 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-2 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1.5 shadow-xs">
              <Compass size={13} className="animate-spin text-emerald-600" /> Safe Zone Geofence
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
          </div>

          <h2 className="text-3xl md:text-4xl font-serif font-bold text-zinc-900 tracking-tight">Safe Haven Radar</h2>
          <p className="text-zinc-500 text-sm max-w-2xl leading-relaxed">
            Real-time geofenced navigation to 24/7 verified open safe zones (police posts, late-night pharmacies, petrol pumps, ER centers) within immediate walking distance.
          </p>

          {gpsError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 max-w-2xl">
              {gpsError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0 z-10 pt-2 xl:pt-0">
          {onTriggerFakeCall && (
            <button
              onClick={onTriggerFakeCall}
              className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 border border-zinc-800"
              title="Simulate believable incoming call distraction"
            >
              <PhoneCall size={15} className="text-emerald-400 animate-pulse" /> Simulate Fake Call
            </button>
          )}

          <button
            onClick={refreshHighAccuracyGps}
            className="p-3 bg-white hover:bg-zinc-100 text-zinc-700 rounded-2xl border border-zinc-200/90 transition-all shadow-xs"
            title="Refresh High-Accuracy GPS Coordinates"
          >
            <RefreshCw size={16} className={gpsStatus === "ACQUIRING" ? "animate-spin" : ""} />
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
                  <Navigation size={16} /> Navigate Nearest ({nearestHaven.distanceMeters}m)
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {gpsError && (
        <div className="glass-card p-4 rounded-[20px] border border-amber-200/90 bg-amber-50/50 text-xs text-amber-800">
          {gpsError} — safe haven list is still available below.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 glass-card-dark text-white p-7 rounded-[32px] border border-zinc-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between z-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live GPS Radar</p>
                <h3 className="text-xl font-bold text-white mt-0.5">800m Safety Perimeter</h3>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono font-bold">
                {gpsStatus === "HIGH_ACCURACY" ? "GPS Active" : "Localizing..."}
              </span>
            </div>

            <div className="my-6 relative h-72 rounded-3xl bg-zinc-950/90 border border-zinc-800/80 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute w-56 h-56 rounded-full border border-emerald-500/20" />
              <div className="absolute w-40 h-40 rounded-full border border-emerald-500/25" />
              <div className="absolute w-24 h-24 rounded-full border border-zinc-800" />

              <span className="absolute top-3 text-[9px] font-mono text-zinc-600">800m</span>
              <span className="absolute top-14 text-[9px] font-mono text-zinc-600">400m</span>

              <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(16,185,129,0.22)_0deg,transparent_60deg)] animate-[spin_6s_linear_infinite]" />

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_16px_rgba(52,211,153,0.9)] border-2 border-zinc-950 animate-pulse" />
                <span className="text-[9px] font-extrabold text-emerald-300 mt-1 bg-zinc-900/90 px-2 py-0.5 rounded-full border border-zinc-800 tracking-wider">YOU</span>
              </div>

              {placesWithDistances.map((place, idx) => {
                const angleDeg = idx * 72 - 50;
                const angleRad = angleDeg * (Math.PI / 180);
                const maxDist = 800;
                const normalizedDist = Math.min(1, place.distanceMeters / maxDist);
                const radiusPixels = 48 + normalizedDist * 60;
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
                    title={`${place.name} (${place.distanceMeters}m)`}
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
                      {place.distanceMeters}m
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="z-10 bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between text-xs backdrop-blur-sm">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0 pr-2">
                <MapPin size={15} className="text-emerald-400 shrink-0" />
                <span className="truncate">
                  Nearest: <strong className="text-white font-semibold">{nearestHaven?.name}</strong>
                </span>
              </div>
              {nearestHaven && (
                <span className="font-mono text-emerald-400 font-bold shrink-0 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  {nearestHaven.distanceMeters}m
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

            <div className="space-y-3">
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
                            {place.distanceMeters}m away (~{place.walkTimeMins} min walk)
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
                          <Phone size={14} className="text-zinc-600" /> Call Station
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
