// Geocoding + routing via OpenStreetMap (Nominatim) and OSRM — no API key.
// Reverse-geocode for the "share location" button; forward-geocode + OSRM
// driving time for the distance-based price (always measured to our base).

export interface LatLon {
  lat: number
  lon: number
}

/** Our dispatch base — every drive is measured to here. */
export const BASE_ADDRESS = 'Rheinische Str. 24, 42781 Haan'
// Approximate coordinates of the base (refined at runtime via forwardGeocode).
const BASE_FALLBACK: LatLon = { lat: 51.206, lon: 7.032 }

/** Maximum service radius (road distance, km). Beyond this we don't dispatch. */
export const MAX_SERVICE_KM = 300

export interface DriveInfo {
  minutes: number
  km: number
}

/** Forward-geocode an address (or pass-through "lat, lon") to coordinates. */
export async function forwardGeocode(query: string): Promise<LatLon | null> {
  const coord = query.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/)
  if (coord) return { lat: parseFloat(coord[1]), lon: parseFloat(coord[2]) }
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1` +
      `&countrycodes=de,at,ch&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const arr = await res.json()
    if (Array.isArray(arr) && arr[0]?.lat && arr[0]?.lon) {
      return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) }
    }
    return null
  } catch {
    return null
  }
}

/** Driving time + road distance between two points via OSRM, or null on failure. */
export async function routeInfo(from: LatLon, to: LatLon): Promise<DriveInfo | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`
    const res = await fetch(url)
    if (!res.ok) return null
    const r = (await res.json()).routes?.[0]
    if (!r || typeof r.duration !== 'number') return null
    return { minutes: Math.round(r.duration / 60), km: Math.round((r.distance ?? 0) / 1000) }
  } catch {
    return null
  }
}

/** Drive time + distance from a customer location string to our base. */
export async function driveInfoToBase(location: string): Promise<DriveInfo | null> {
  const [customer, base] = await Promise.all([
    forwardGeocode(location),
    forwardGeocode(BASE_ADDRESS),
  ])
  if (!customer) return null
  return routeInfo(customer, base ?? BASE_FALLBACK)
}

// Reverse-geocode GPS coordinates into a human street address via OpenStreetMap
// Nominatim (no API key). Used by the "share location" button so we capture the
// street name and number instead of raw coordinates.

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}
    const road = a.road ?? a.pedestrian ?? a.footway ?? a.cycleway ?? null
    const houseNumber = a.house_number ?? ''
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? ''
    const postcode = a.postcode ?? ''
    if (road) {
      const street = houseNumber ? `${road} ${houseNumber}` : road
      const cityPart = [postcode, city].filter(Boolean).join(' ')
      return [street, cityPart].filter(Boolean).join(', ')
    }
    return typeof data.display_name === 'string' ? data.display_name : null
  } catch {
    return null
  }
}
