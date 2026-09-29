'use client'

import { useCallback, useEffect, useState } from 'react'

const CLAVE = 'dream-team:estructura:panel'

/**
 * Whether the org chart pane is open, remembered per visitor in
 * `localStorage`. It starts open and reads the saved choice in an effect, so
 * the server render never depends on the browser; every storage access is
 * wrapped because it can throw (private windows, blocked site data).
 */
export function usePanelAbierto(): readonly [boolean, () => void] {
  const [abierto, setAbierto] = useState(true)

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a persisted UI preference after mount (same pattern as sidebar-moderna.tsx)
      if (window.localStorage.getItem(CLAVE) === 'cerrado') setAbierto(false)
    } catch {
      // No storage: keep the default.
    }
  }, [])

  const alternar = useCallback(() => {
    const siguiente = !abierto
    setAbierto(siguiente)
    try {
      window.localStorage.setItem(CLAVE, siguiente ? 'abierto' : 'cerrado')
    } catch {
      // The choice just won't survive a reload.
    }
  }, [abierto])

  return [abierto, alternar]
}
