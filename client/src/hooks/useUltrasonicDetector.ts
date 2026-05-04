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
const WINDOW_SIZE = 12

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
// Calls onDetected(code) once when a valid 4-char code is found.
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

        const recentCommitted: number[] = []
        let lastFreq: number | null = null
        let stableCount = 0
        let pendingCode: string | null = null

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
            if (stableCount === STABLE_SAMPLES) {
              recentCommitted.push(freq)
              if (recentCommitted.length > WINDOW_SIZE) recentCommitted.shift()

              // Scan window for [START, C0, C1, C2, C3] pattern
              for (let i = 0; i <= recentCommitted.length - 5; i++) {
                if (!isStartFreq(recentCommitted[i])) continue
                const chars: string[] = []
                let valid = true
                for (let j = 1; j <= 4; j++) {
                  const ch = freqToChar(recentCommitted[i + j])
                  if (!ch) { valid = false; break }
                  chars.push(ch)
                }
                if (valid) {
                  recentCommitted.length = 0
                  const code = chars.join('')
                  if (code === pendingCode) {
                    pendingCode = null
                    onDetectedRef.current(code)
                  } else {
                    pendingCode = code
                  }
                }
              }
            }
          } else {
            lastFreq = freq
            stableCount = 1
          }
        }, SAMPLE_INTERVAL_MS)

        cleanupRef.current = () => {
          clearInterval(interval)
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
