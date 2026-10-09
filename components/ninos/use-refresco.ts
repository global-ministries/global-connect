'use client'

import { useEffect, useRef } from 'react'

/** Calls `refrescar` every `ms` while the page is visible, and again when it regains focus. No websockets. */
export function useRefrescoVisible(refrescar: () => void, ms = 20_000) {
  const ref = useRef(refrescar)
  useEffect(() => {
    ref.current = refrescar
  }, [refrescar])

  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    const tick = () => {
      if (visible()) ref.current()
    }
    const id = window.setInterval(tick, ms)
    const alVolver = () => tick()
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', alVolver)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [ms])
}
