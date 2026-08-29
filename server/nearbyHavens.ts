export type HavenCategory = "POLICE" | "PHARMACY" | "PETROL" | "HOSPITAL";

export interface NearbyHaven {
  id: string;
  slotId: string;
  name: string;
  category: HavenCategory;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  is24x7: boolean;
  notes: string;
  distanceMeters: number;
  walkTimeMins: number;
  verified: boolean;
  mapName?: string;
  mapAddress?: string;
}

interface HavenSlot {
  slotId: string;
  category: HavenCategory;
  pickIndex: number;
  name: string;
  address: string;
  phone: string;
  is24x7: boolean;
  notes: string;
}

/** Original 5 prefilled safe-haven entries — display text stays fixed; coords come from OSM */
export const HAVEN_SLOTS: HavenSlot[] = [
  {
    slotId: "p1",
    category: "POLICE",
    pickIndex: 0,
    name: "24/7 Police Patrol & Emergency Booth",
    address: "Nearest Public Security Gate & Booth",
    phone: "112",
    is24x7: true,
    notes: "Lit 24/7 armed police presence with CCTV coverage",
  },
  {
    slotId: "p2",
    category: "POLICE",
    pickIndex: 1,
    name: "Transit Police Security Post",
    address: "Nearby Metro / Rail Station Gate 1",
    phone: "112",
    is24x7: true,
    notes: "Illuminated security desk & female officer desk",
  },
  {
    slotId: "ph1",
    category: "PHARMACY",
    pickIndex: 0,
    name: "24/7 Apollo Emergency Chemist",
    address: "Commercial Center, Main Road",
    phone: "+18002550199",
    is24x7: true,
    notes: "24/7 open pharmacy with security guard outside",
  },
  {
    slotId: "fuel1",
    category: "PETROL",
    pickIndex: 0,
    name: "IndianOil 24/7 Fuel & Express Store",
    address: "Main Traffic Junction",
    phone: "+18002550144",
    is24x7: true,
    notes: "High-footfall 24/7 convenience market & CCTV",
  },
  {
    slotId: "h1",
    category: "HOSPITAL",
    pickIndex: 0,
    name: "City Hospital - 24/7 Emergency ER",
    address: "Hospital Emergency Entrance",
    phone: "102",
    is24x7: true,
    notes: "24/7 ER reception desk with security personnel",
  },
];

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

function tagsToCategory(tags: Record<string, string>): HavenCategory | null {
  if (tags.amenity === "police" || tags.office === "police") return "POLICE";
  if (tags.amenity === "pharmacy" || tags.shop === "chemist") return "PHARMACY";
  if (tags.amenity === "fuel") return "PETROL";
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "HOSPITAL";
  if (tags.amenity === "clinic" && (tags.emergency === "yes" || tags.healthcare === "clinic")) {
    return "HOSPITAL";
  }
  return null;
}

function formatAddress(tags: Record<string, string>): string {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
  ].filter(Boolean);
  return parts.join(", ") || tags["addr:full"] || "Address unavailable";
}

function formatPhone(tags: Record<string, string>, category: HavenCategory): string {
  return tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "";
}

function isOpen24x7(tags: Record<string, string>): boolean {
  const hours = (tags.opening_hours || tags["opening_hours:covid19"] || "").toLowerCase();
  return hours.includes("24/7") || tags.emergency === "yes";
}

function elementCoords(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.type === "node" && el.lat != null && el.lon != null) {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center?.lat != null && el.center?.lon != null) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

interface MapMatch {
  lat: number;
  lng: number;
  mapName: string;
  mapAddress: string;
  distanceMeters: number;
}

async function queryOverpass(lat: number, lng: number, radiusMeters: number): Promise<OverpassElement[]> {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="police"](around:${radiusMeters},${lat},${lng});
      way["amenity"="police"](around:${radiusMeters},${lat},${lng});
      node["office"="police"](around:${radiusMeters},${lat},${lng});
      way["office"="police"](around:${radiusMeters},${lat},${lng});
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      way["healthcare"="hospital"](around:${radiusMeters},${lat},${lng});
      node["amenity"="clinic"]["emergency"="yes"](around:${radiusMeters},${lat},${lng});
      way["amenity"="clinic"]["emergency"="yes"](around:${radiusMeters},${lat},${lng});
      node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
      way["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
      node["shop"="chemist"](around:${radiusMeters},${lat},${lng});
      way["shop"="chemist"](around:${radiusMeters},${lat},${lng});
      node["amenity"="fuel"](around:${radiusMeters},${lat},${lng});
      way["amenity"="fuel"](around:${radiusMeters},${lat},${lng});
    );
    out center 60;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data = (await response.json()) as OverpassResponse;
  return data.elements;
}

function groupMapMatches(
  elements: OverpassElement[],
  user: { lat: number; lng: number }
): Record<HavenCategory, MapMatch[]> {
  const grouped: Record<HavenCategory, MapMatch[]> = {
    POLICE: [],
    PHARMACY: [],
    PETROL: [],
    HOSPITAL: [],
  };
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags || {};
    const category = tagsToCategory(tags);
    if (!category) continue;

    const coords = elementCoords(el);
    if (!coords) continue;

    const dedupeKey = `${category}:${coords.lat.toFixed(5)}:${coords.lng.toFixed(5)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const distanceMeters = Math.round(haversineMeters(user, coords));
    const mapName =
      tags.name ||
      tags.brand ||
      tags.operator ||
      `${category.charAt(0) + category.slice(1).toLowerCase()} (${distanceMeters}m)`;

    grouped[category].push({
      lat: coords.lat,
      lng: coords.lng,
      mapName,
      mapAddress: formatAddress(tags),
      distanceMeters,
    });
  }

  for (const category of Object.keys(grouped) as HavenCategory[]) {
    grouped[category].sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  return grouped;
}

export async function fetchVerifiedSafeHavens(
  lat: number,
  lng: number,
  radiusMeters = 5000
): Promise<NearbyHaven[]> {
  const user = { lat, lng };
  const elements = await queryOverpass(lat, lng, radiusMeters);
  const grouped = groupMapMatches(elements, user);

  return HAVEN_SLOTS.map((slot) => {
    const match = grouped[slot.category][slot.pickIndex];
    if (match) {
      return {
        id: slot.slotId,
        slotId: slot.slotId,
        name: slot.name,
        category: slot.category,
        address: slot.address,
        phone: slot.phone,
        lat: match.lat,
        lng: match.lng,
        is24x7: slot.is24x7,
        notes: slot.notes,
        distanceMeters: match.distanceMeters,
        walkTimeMins: Math.max(1, Math.ceil(match.distanceMeters / 75)),
        verified: true,
        mapName: match.mapName,
        mapAddress: match.mapAddress,
      };
    }

    return {
      id: slot.slotId,
      slotId: slot.slotId,
      name: slot.name,
      category: slot.category,
      address: slot.address,
      phone: slot.phone,
      lat: 0,
      lng: 0,
      is24x7: slot.is24x7,
      notes: slot.notes,
      distanceMeters: 0,
      walkTimeMins: 0,
      verified: false,
    };
  });
}

export async function fetchNearbyHavens(
  lat: number,
  lng: number,
  radiusMeters = 5000
): Promise<NearbyHaven[]> {
  return fetchVerifiedSafeHavens(lat, lng, radiusMeters);
}
