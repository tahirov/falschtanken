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
