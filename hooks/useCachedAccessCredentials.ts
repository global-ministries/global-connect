"use client"

import { useEffect, useRef, useState } from 'react'

function areArraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

/**
 * Retains the last non-empty set of access credentials while `loading` is true.
 * Clears the cache when the user signs out (`isSignedIn === false`).
 */
export function useCachedAccessCredentials<T extends string>({
  values,
  loading,
  isSignedIn,
}: {
  values: T[]
  loading: boolean
  isSignedIn: boolean
}): T[] {
  const [cachedValues, setCachedValues] = useState<T[]>([])
  const previousIsSignedInRef = useRef(isSignedIn)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- cache synchronization tied to authentication/loading lifecycle */
    if (!loading) {
      if (values.length > 0 && !areArraysEqual(values, cachedValues)) {
        setCachedValues(values)
      }
      if (!isSignedIn && previousIsSignedInRef.current && cachedValues.length > 0) {
        setCachedValues([])
      }
      previousIsSignedInRef.current = isSignedIn
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loading, values, isSignedIn, cachedValues])

  if (!loading) return values
  return cachedValues.length > 0 ? cachedValues : values
}
