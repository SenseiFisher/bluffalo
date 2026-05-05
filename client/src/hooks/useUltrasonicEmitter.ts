import { useEffect, useRef } from 'react'
import { ROOM_CODE_ALPHABET } from '@shared/constants'

export const ULTRASONIC_START_FREQ = 19_500
export const ULTRASONIC_BASE_FREQ = 19_700
export const ULTRASONIC_FREQ_STEP = 20   // 32 chars × 20 Hz = 620 Hz span → max 20,320 Hz

const TONE_MS = 200
const GAP_MS = 120
const REPEAT_GAP_MS = 500

function charFreq(char: string): number {
  return ULTRASONIC_BASE_FREQ + ROOM_CODE_ALPHABET.indexOf(char) * ULTRASONIC_FREQ_STEP
}

function playTone(ctx: AudioContext, freq: number, startSec: number, durationMs: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  const dur = durationMs / 1000
  const ramp = 0.005
  gain.gain.setValueAtTime(0, startSec)
  gain.gain.linearRampToValueAtTime(0.05, startSec + ramp)
  gain.gain.setValueAtTime(0.05, startSec + dur - ramp)
  gain.gain.linearRampToValueAtTime(0, startSec + dur)
  osc.start(startSec)
  osc.stop(startSec + dur)
}

// Protocol: [START_TONE][C0][C1][C2][C3] repeated every ~1.9s
export function useUltrasonicEmitter(roomCode: string, active: boolean): void {
  const stopRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active || roomCode.length !== 4) return

    const ctx = new AudioContext()
    stopRef.current = false

    function schedule() {
      if (stopRef.current) return
      let t = ctx.currentTime + 0.02

      playTone(ctx, ULTRASONIC_START_FREQ, t, TONE_MS)
      t += (TONE_MS + GAP_MS) / 1000

      for (const ch of roomCode) {
        playTone(ctx, charFreq(ch), t, TONE_MS)
        t += (TONE_MS + GAP_MS) / 1000
      }

      const cycleMs = (TONE_MS + GAP_MS) * 5 + REPEAT_GAP_MS
      timeoutRef.current = setTimeout(schedule, cycleMs)
    }

    schedule()

    return () => {
      stopRef.current = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      ctx.close()
    }
  }, [active, roomCode])
}
