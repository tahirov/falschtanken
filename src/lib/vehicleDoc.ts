import { supabase } from '@/lib/supabase'
import type { VehicleDoc } from '@/lib/orders'

export interface ScanResult {
  /** Extracted necessary fields, or null if nothing usable was read. */
  doc: VehicleDoc | null
  /** "Marke Modell Baujahr" built from the doc, for the vehicle field. */
  vehicle: string
  /** Public URL of the uploaded photo (the reference), or null if upload failed. */
  url: string | null
  error: string | null
}

/** Read a File as a base64 string (no data-URI prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Upload a Fahrzeugschein photo to Storage (the reference) and scan it with the
 * vision model to extract the necessary fields. Upload and scan are independent
 * — a scan failure still keeps the stored image, and vice versa.
 */
export async function scanVehicleDoc(file: File, lang: string): Promise<ScanResult> {
  const base64 = await fileToBase64(file)
  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  // Unique-enough object name without needing a crypto import.
  const name = `${Date.now()}-${Math.round(performance.now())}.${ext}`

  // Kick off upload and scan together.
  const uploadP = supabase.storage
    .from('vehicle-docs')
    .upload(name, file, { contentType: file.type, upsert: false })
    .then(({ error }) => {
      if (error) return null
      return supabase.storage.from('vehicle-docs').getPublicUrl(name).data.publicUrl ?? null
    })
    .catch(() => null)

  const scanP = supabase.functions
    .invoke('scan-vehicle-doc', { body: { image: base64, mime: file.type, lang } })
    .then(({ data, error }) => {
      if (error || !data || data.error) {
        return { doc: null as VehicleDoc | null, vehicle: '', err: error?.message ?? data?.error ?? 'scan failed' }
      }
      return { doc: (data.doc ?? null) as VehicleDoc | null, vehicle: (data.vehicle ?? '') as string, err: null }
    })
    .catch((e) => ({ doc: null as VehicleDoc | null, vehicle: '', err: String(e) }))

  const [url, scan] = await Promise.all([uploadP, scanP])
  return { doc: scan.doc, vehicle: scan.vehicle, url, error: scan.err }
}
