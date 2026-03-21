import { useState, useEffect, useRef } from 'react'

/**
 * Takes timer_ends_at (Unix ms timestamp from server).
 * Returns remaining seconds. Updates every second. Returns 0 when expired.
 */
export function useTimer(timerEndsAt: number | null): number {
  const calcRemaining = () => {
    if (timerEndsAt === null) return 0
    const remaining = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000))
    return remaining
  }

  const [remaining, setRemaining] = useState<number>(calcRemaining)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerEndsAt === null) {
      setRemaining(0)
      return
    }

    // Set immediately
    setRemaining(calcRemaining())

    intervalRef.current = setInterval(() => {
      const r = calcRemaining()
      setRemaining(r)
      if (r <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, 500)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [timerEndsAt])

  return remaining
}
