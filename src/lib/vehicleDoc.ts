import { supabase } from '@/lib/supabase'
import type { VehicleDoc } from '@/lib/orders'

/** Accepted Fahrzeugschein upload types and size cap. */
export const ACCEPTED_DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const ACCEPT_ATTR = 'image/jpeg,image/png,application/pdf'
export const MAX_UPLOAD_MB = 10

export interface ScanResult {
  /** Extracted necessary fields, or null if nothing usable was read. */
  doc: VehicleDoc | null
  /** "Marke Modell Baujahr" built from the doc, for the vehicle field. */
  vehicle: string
  /** Public URL of the uploaded file (the reference), or null if upload failed. */
  url: string | null
  /** False when the file was stored but not auto-read (e.g. a PDF). */
  scanned: boolean
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
 * Upload a Fahrzeugschein file to Storage (the reference) and, for images,
 * scan it with the vision model to extract the fields. PDFs are stored as a
 * reference only (the vision model reads JPG/PNG, not PDF). Upload and scan are
 * independent — a scan failure still keeps the stored file, and vice versa.
 */
export async function scanVehicleDoc(file: File, lang: string): Promise<ScanResult> {
  const isImage = file.type === 'image/jpeg' || file.type === 'image/png'
  const ext = file.type === 'image/png' ? 'png' : file.type === 'application/pdf' ? 'pdf' : 'jpg'
  // Unique-enough object name without needing a crypto import.
  const name = `${Date.now()}-${Math.round(performance.now())}.${ext}`

  const uploadP = supabase.storage
    .from('vehicle-docs')
    .upload(name, file, { contentType: file.type, upsert: false })
    .then(({ error }) => {
      if (error) return null
      return supabase.storage.from('vehicle-docs').getPublicUrl(name).data.publicUrl ?? null
    })
    .catch(() => null)

  // Only images go to the vision model; a PDF is kept as a reference only.
  const scanP = isImage
    ? fileToBase64(file).then((base64) =>
        supabase.functions
          .invoke('scan-vehicle-doc', { body: { image: base64, mime: file.type, lang } })
          .then(({ data, error }) => {
            if (error || !data || data.error) {
              return { doc: null as VehicleDoc | null, vehicle: '', err: error?.message ?? data?.error ?? 'scan failed' }
            }
            return { doc: (data.doc ?? null) as VehicleDoc | null, vehicle: (data.vehicle ?? '') as string, err: null }
          }),
      ).catch((e) => ({ doc: null as VehicleDoc | null, vehicle: '', err: String(e) }))
    : Promise.resolve({ doc: null as VehicleDoc | null, vehicle: '', err: null })

  const [url, scan] = await Promise.all([uploadP, scanP])
  return { doc: scan.doc, vehicle: scan.vehicle, url, scanned: !!scan.doc, error: scan.err }
}
