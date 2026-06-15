// Minimal mic recorder that yields 16 kHz mono 16-bit WAV as base64 — the one
// format the NVIDIA omni model reliably accepts across all browsers (Chrome's
// MediaRecorder only emits webm/opus, Safari only mp4, so we capture raw PCM
// and encode WAV ourselves).

const TARGET_RATE = 16000

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

export class WavRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private sampleRate = 44100

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const Ctx = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
    if (!Ctx) throw new Error('AudioContext unavailable')
    this.ctx = new Ctx()
    this.sampleRate = this.ctx.sampleRate
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.chunks = []
    this.processor.onaudioprocess = (e) => {
      // Copy: the underlying buffer is reused by the audio thread.
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    this.source.connect(this.processor)
    // Connect to destination so the callback fires; we never write output, so
    // nothing is played back (no echo).
    this.processor.connect(this.ctx.destination)
  }

  /** Stop, release the mic, and return the recording as base64 WAV. */
  async stop(): Promise<string> {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    try { await this.ctx?.close() } catch { /* ignore */ }
    const merged = mergeChunks(this.chunks)
    const down = downsample(merged, this.sampleRate, TARGET_RATE)
    return toBase64(encodeWav(down, TARGET_RATE))
  }

  cancel(): void {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    try { this.ctx?.close() } catch { /* ignore */ }
    this.chunks = []
  }
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function downsample(buffer: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return buffer
  const ratio = from / to
  const newLen = Math.round(buffer.length / ratio)
  const out = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const start = Math.round(i * ratio)
    const end = Math.min(Math.round((i + 1) * ratio), buffer.length)
    let sum = 0
    let count = 0
    for (let j = start; j < end; j++) {
      sum += buffer[j]
      count++
    }
    out[i] = count ? sum / count : 0
  }
  return out
}

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
