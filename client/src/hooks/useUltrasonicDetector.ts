import { useEffect, useRef, useState, useCallback } from 'react'
import { ROOM_CODE_ALPHABET } from '@shared/constants'
import {
  ULTRASONIC_START_FREQ,
  ULTRASONIC_BASE_FREQ,
  ULTRASONIC_FREQ_STEP,
} from './useUltrasonicEmitter'

const FREQ_TOLERANCE = ULTRASONIC_FREQ_STEP * 0.45
const MIN_AMPLITUDE = 55
const SAMPLE_INTERVAL_MS = 40
const STABLE_SAMPLES = 2

// Time-based slot sampling constants (ms from START commit)
// Commit happens ~60ms into START tone; Cn midpoint is at t0+420+n*320
// → delay from commit = 360 + n*320
const SLOT_SAMPLE_BASE_MS = 360
const SLOT_MS = 320

export type DetectorStatus = 'idle' | 'requesting' | 'listening' | 'error'
export type DetectorDebug = { freq: number; amplitude: number } | null

function getPeakInRange(analyser: AnalyserNode, sampleRate: number): { freq: number; amplitude: number } | null {
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  const binHz = sampleRate / analyser.fftSize

  const minBin = Math.floor(18_700 / binHz)
  const maxBin = Math.ceil(20_200 / binHz)

  let peak = 0
  let peakBin = -1
  for (let i = minBin; i <= maxBin; i++) {
    if (data[i] > peak) { peak = data[i]; peakBin = i }
  }

  if (peakBin === -1) return null
  return { freq: peakBin * binHz, amplitude: peak }
}

function isStartFreq(freq: number): boolean {
  return Math.abs(freq - ULTRASONIC_START_FREQ) < FREQ_TOLERANCE
}

function freqToChar(freq: number): string | null {
  const idx = Math.round((freq - ULTRASONIC_BASE_FREQ) / ULTRASONIC_FREQ_STEP)
  if (idx < 0 || idx >= ROOM_CODE_ALPHABET.length) return null
  if (Math.abs(freq - (ULTRASONIC_BASE_FREQ + idx * ULTRASONIC_FREQ_STEP)) > FREQ_TOLERANCE) return null
  return ROOM_CODE_ALPHABET[idx]
}

// Listens via microphone and decodes the ultrasonic room code beacon.
// Calls onDetected(code) once when a valid 4-char code is confirmed twice in a row.
export function useUltrasonicDetector(
  active: boolean,
  onDetected: (code: string) => void,
): { status: DetectorStatus; errorMessage: string | null; debug: DetectorDebug; stop: () => void } {
  const [status, setStatus] = useState<DetectorStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [debug, setDebug] = useState<DetectorDebug>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setStatus('idle')
    setErrorMessage(null)
    setDebug(null)
  }, [])

  useEffect(() => {
    if (!active) {
      cleanupRef.current?.()
      cleanupRef.current = null
      setDebug(null)
      return
    }

    let stopped = false
    setStatus('requesting')
    setErrorMessage(null)
    setDebug(null)

    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
      .then((stream) => {
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

        const ctx = new AudioContext()
        ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 8192
        analyser.smoothingTimeConstant = 0.2
        source.connect(analyser)
        setStatus('listening')

        let lastFreq: number | null = null
        let stableCount = 0
        let pendingCode: string | null = null
        let isCapturing = false
        let capturedChars: (string | null)[] = [null, null, null, null]
        let captureTimeouts: ReturnType<typeof setTimeout>[] = []

        function triggerCapture() {
          isCapturing = true
          capturedChars = [null, null, null, null]
          captureTimeouts = []

          for (let n = 0; n < 4; n++) {
            const delay = SLOT_SAMPLE_BASE_MS + n * SLOT_MS
            captureTimeouts.push(setTimeout(() => {
              if (stopped) { isCapturing = false; return }

              const peak = getPeakInRange(analyser, ctx.sampleRate)
              const ch = (peak && peak.amplitude >= MIN_AMPLITUDE) ? freqToChar(peak.freq) : null
              capturedChars[n] = ch

              if (n === 3) {
                isCapturing = false
                captureTimeouts = []

                if (capturedChars.every(c => c !== null)) {
                  const code = (capturedChars as string[]).join('')
                  if (code === pendingCode) {
                    pendingCode = null
                    onDetectedRef.current(code)
                  } else {
                    pendingCode = code
                  }
                }
              }
            }, delay))
          }
        }

        const interval = setInterval(() => {
          if (stopped) return
          const peak = getPeakInRange(analyser, ctx.sampleRate)

          setDebug(peak ? { freq: Math.round(peak.freq), amplitude: peak.amplitude } : null)

          if (!peak || peak.amplitude < MIN_AMPLITUDE) {
            lastFreq = null
            stableCount = 0
            return
          }

          const freq = peak.freq
          const isSame = lastFreq !== null && Math.abs(freq - lastFreq) < FREQ_TOLERANCE
          if (isSame) {
            stableCount++
            if (stableCount === STABLE_SAMPLES && isStartFreq(freq) && !isCapturing) {
              triggerCapture()
            }
          } else {
            lastFreq = freq
            stableCount = 1
          }
        }, SAMPLE_INTERVAL_MS)

        cleanupRef.current = () => {
          clearInterval(interval)
          captureTimeouts.forEach(clearTimeout)
          stream.getTracks().forEach(t => t.stop())
          ctx.close()
        }
      })
      .catch((err) => {
        if (stopped) return
        setStatus('error')
        setErrorMessage(
          err.name === 'NotAllowedError'
            ? 'Microphone access denied.'
            : 'Could not access microphone.',
        )
      })

    return () => {
      stopped = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [active])

  return { status, errorMessage, debug, stop }
}
