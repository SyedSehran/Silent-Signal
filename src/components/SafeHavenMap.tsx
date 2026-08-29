import { useState, useEffect, useMemo, useCallback } from "react";
import { MapPin, Navigation, Shield, Phone, ExternalLink, Compass, Fuel, Building2, Cross, CheckCircle2, RefreshCw, PhoneCall } from "lucide-react";
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
  category: HavenCategory;
  address: string;
  phone: string;
  offsetLat: number;
  offsetLng: number;
  is24x7: boolean;
  notes: string;
}

const DEFAULT_USER_LOCATION: Location = { lat: 28.6139, lng: 77.209 };

const BASE_HAVENS: SafeHavenPlace[] = [
  {
    id: "p1",
    name: "24/7 Police Patrol & Emergency Booth",
    category: "POLICE",
    address: "Nearest Public Security Gate & Booth",
    phone: "112",
    offsetLat: 0.0014,
    offsetLng: 0.0011,
    is24x7: true,
    notes: "Lit 24/7 armed police presence with CCTV coverage",
  },
  {
    id: "p2",
    name: "Transit Police Security Post",
    category: "POLICE",
    address: "Nearby Metro / Rail Station Gate 1",
    phone: "112",
    offsetLat: -0.0018,
    offsetLng: 0.0013,
    is24x7: true,
    notes: "Illuminated security desk & female officer desk",
  },
  {
    id: "ph1",
    name: "24/7 Apollo Emergency Chemist",
    category: "PHARMACY",
    address: "Commercial Center, Main Road",
    phone: "+18002550199",
    offsetLat: 0.0009,
    offsetLng: -0.0015,
    is24x7: true,
    notes: "24/7 open pharmacy with security guard outside",
  },
  {
    id: "fuel1",
    name: "IndianOil 24/7 Fuel & Express Store",
    category: "PETROL",
    address: "Main Traffic Junction",
    phone: "+18002550144",
    offsetLat: 0.0022,
    offsetLng: -0.0008,
    is24x7: true,
    notes: "High-footfall 24/7 convenience market & CCTV",
  },
  {
    id: "h1",
    name: "City Hospital - 24/7 Emergency ER",
    category: "HOSPITAL",
    address: "Hospital Emergency Entrance",
    phone: "102",
    offsetLat: 0.0026,
    offsetLng: 0.0024,
    is24x7: true,
    notes: "24/7 ER reception desk with security personnel",
  },
];

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
  const [gpsStatus, setGpsStatus] = useState<"ACQUIRING" | "HIGH_ACCURACY" | "FALLBACK">("ACQUIRING");
  const [selectedCategory, setSelectedCategory] = useState<HavenCategory>("ALL");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isEnRouteTracking, setIsEnRouteTracking] = useState(false);

  const refreshHighAccuracyGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("FALLBACK");
      return;
    }
    setGpsStatus("ACQUIRING");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("HIGH_ACCURACY");
      },
      (err) => {
        console.warn("High-accuracy GPS request error:", err);
        setGpsStatus("FALLBACK");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    refreshHighAccuracyGps();

    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsStatus("HIGH_ACCURACY");
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [refreshHighAccuracyGps]);

  const userCoords = useMemo<Location>(() => {
    return liveGps || latestLocation || DEFAULT_USER_LOCATION;
  }, [liveGps, latestLocation]);

  const placesWithDistances = useMemo(() => {
    return BASE_HAVENS.map((place) => {
      const placeLat = userCoords.lat + place.offsetLat;
      const placeLng = userCoords.lng + place.offsetLng;
      const distanceMeters = Math.round(
        haversineMeters(userCoords, { lat: placeLat, lng: placeLng })
      );
      const walkTimeMins = Math.max(1, Math.ceil(distanceMeters / 75));
      return {
        ...place,
        computedLat: placeLat,
        computedLng: placeLng,
        distanceMeters,
        walkTimeMins,
      };
    }).sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [userCoords]);

  const filteredPlaces = useMemo(() => {
    if (selectedCategory === "ALL") return placesWithDistances;
    return placesWithDistances.filter((p) => p.category === selectedCategory);
  }, [placesWithDistances, selectedCategory]);

  const nearestHaven = placesWithDistances[0];

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

  const handleOpenDirections = (lat: number, lng: number) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner with Premium Styling */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 glass-card p-7 rounded-[32px] border border-zinc-200/90 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-2 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1.5 shadow-xs">
              <Compass size={13} className="animate-spin text-emerald-600" /> Safe Zone Geofence
            </span>

            {gpsStatus === "HIGH_ACCURACY" && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900 text-emerald-400 border border-zinc-800 flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                GPS Active ({userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)})
              </span>
            )}

            {gpsStatus === "ACQUIRING" && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin text-amber-600" /> Locating...
              </span>
            )}
          </div>

          <h2 className="text-3xl md:text-4xl font-serif font-bold text-zinc-900 tracking-tight">Safe Haven Radar</h2>
          <p className="text-zinc-500 text-sm max-w-2xl leading-relaxed">
            Real-time geofenced navigation to 24/7 verified open safe zones (police posts, late-night pharmacies, petrol pumps, ER centers) within immediate walking distance.
          </p>
        </div>

        {/* Action Controls Header */}
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

      {/* Interactive Radar Visualizer & Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Map Card */}
        <div className="lg:col-span-1 glass-card-dark text-white p-7 rounded-[32px] border border-zinc-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live GPS Radar</p>
              <h3 className="text-xl font-bold text-white mt-0.5">500m Safety Perimeter</h3>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-full font-mono font-bold">
              {gpsStatus === "HIGH_ACCURACY" ? "GPS Active" : "Localizing..."}
            </span>
          </div>

          {/* Decluttered Interactive Radar Visualizer */}
          <div className="my-6 relative h-72 rounded-3xl bg-zinc-950/90 border border-zinc-800/80 flex items-center justify-center overflow-hidden shadow-inner">
            {/* Distance Perimeter Rings with Labels */}
            <div className="absolute w-56 h-56 rounded-full border border-emerald-500/20" />
            <div className="absolute w-40 h-40 rounded-full border border-emerald-500/25" />
            <div className="absolute w-24 h-24 rounded-full border border-zinc-800" />
            
            {/* Subtle Distance Axis Labels */}
            <span className="absolute top-3 text-[9px] font-mono text-zinc-600">500m</span>
            <span className="absolute top-14 text-[9px] font-mono text-zinc-600">250m</span>

            {/* Radar Sweeping Beam */}
            <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(16,185,129,0.22)_0deg,transparent_60deg)] animate-[spin_6s_linear_infinite]" />

            {/* Center User Marker */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_16px_rgba(52,211,153,0.9)] border-2 border-zinc-950 animate-pulse" />
              <span className="text-[9px] font-extrabold text-emerald-300 mt-1 bg-zinc-900/90 px-2 py-0.5 rounded-full border border-zinc-800 tracking-wider">YOU</span>
            </div>

            {/* Well-Spaced Safe Haven Dots (72deg separation) */}
            {placesWithDistances.map((place, idx) => {
              // Distribute 5 items evenly around 360 degrees (72 degrees apart)
              const angleDeg = idx * 72 - 50; // offset start angle for clean layout
              const angleRad = angleDeg * (Math.PI / 180);
              
              // Scale radius nicely between 48px and 108px for uncluttered spacing
              const maxDist = 350;
              const normalizedDist = Math.min(1, place.distanceMeters / maxDist);
              const radiusPixels = 48 + normalizedDist * 60;
              
              const x = Math.cos(angleRad) * radiusPixels;
              const y = Math.sin(angleRad) * radiusPixels;
              const isSelected = selectedPlaceId === place.id;

              return (
                <button
                  key={place.id}
                  onClick={() => setSelectedPlaceId(place.id)}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                  className={`absolute z-20 transition-all duration-300 flex items-center gap-1.5 p-1 rounded-full group ${
                    isSelected ? "scale-115 z-30" : "hover:scale-110"
                  }`}
                  title={`${place.name} (${place.distanceMeters}m)`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full transition-all ${
                    isSelected
                      ? "bg-amber-400 ring-4 ring-amber-400/40 glow-amber"
                      : "bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  }`} />
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md transition-all border ${
                    isSelected
                      ? "bg-amber-400 text-zinc-950 border-amber-400 shadow-sm"
                      : "bg-zinc-900/90 text-zinc-300 border-zinc-800 opacity-80 group-hover:opacity-100"
                  }`}>
                    {place.distanceMeters}m
                  </span>
                </button>
              );
            })}
          </div>

          <div className="z-10 bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between text-xs backdrop-blur-sm">
            <div className="flex items-center gap-2 text-zinc-300 min-w-0 pr-2">
              <MapPin size={15} className="text-emerald-400 shrink-0" />
              <span className="truncate">Nearest: <strong className="text-white font-semibold">{nearestHaven?.name}</strong></span>
            </div>
            <span className="font-mono text-emerald-400 font-bold shrink-0 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">{nearestHaven?.distanceMeters}m</span>
          </div>
        </div>

        {/* Haven List & Category Filters */}
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
                  onClick={() => setSelectedPlaceId(place.id)}
                  className={`glass-card p-6 rounded-[24px] border transition-all cursor-pointer hover-lift ${
                    isSelected ? "border-emerald-500 ring-2 ring-emerald-500/15" : "border-zinc-200/90 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider flex items-center gap-1 ${getCategoryBadgeClass(place.category)}`}>
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
                          handleOpenDirections(place.computedLat, place.computedLng);
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
