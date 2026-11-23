import { useEffect } from 'react'

/**
 * Plays a repeating three-pulse tone while an unanswered emergency is open.
 * Browsers only allow sound after the user has interacted with the page, so
 * the console starts muted and the nurse turns sound on once per shift.
 */
export function useAlarmTone(active: boolean, enabled: boolean) {
  useEffect(() => {
    if (!active || !enabled) return
    const Ctx = window.AudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const burst = () => {
      const now = ctx.currentTime
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0, now + i * 0.25)
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.25 + 0.02)
        gain.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.18)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now + i * 0.25)
        osc.stop(now + i * 0.25 + 0.2)
      }
    }
    burst()
    const timer = window.setInterval(burst, 2000)
    return () => {
      window.clearInterval(timer)
      void ctx.close()
    }
  }, [active, enabled])
}
