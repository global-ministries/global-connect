import { renderHook } from '@testing-library/react'
import { useCachedAccessCredentials } from '@/hooks/useCachedAccessCredentials'

describe('useCachedAccessCredentials', () => {
  it('returns non-empty values while loading is false', () => {
    const values = ['admin', 'pastor']
    const { result } = renderHook(() => useCachedAccessCredentials({ values, loading: false, isSignedIn: true }))
    expect(result.current).toEqual(values)
  })

  it('retains cached values while loading is true even if current values are empty', () => {
    const cachedValues = ['admin', 'pastor']
    const { result, rerender } = renderHook(
      ({ values, loading }) => useCachedAccessCredentials({ values, loading, isSignedIn: true }),
      { initialProps: { values: cachedValues, loading: false } }
    )
    expect(result.current).toEqual(cachedValues)
    rerender({ values: [], loading: true })
    expect(result.current).toEqual(cachedValues)
  })

  it('clears the cache on sign-out and returns current empty values on subsequent loading', () => {
    const { result, rerender } = renderHook(
      ({ values, loading, isSignedIn }) => useCachedAccessCredentials({ values, loading, isSignedIn }),
      { initialProps: { values: ['admin'], loading: false, isSignedIn: true } }
    )
    expect(result.current).toEqual(['admin'])
    rerender({ values: [], loading: false, isSignedIn: false })
    expect(result.current).toEqual([])
    rerender({ values: [], loading: true, isSignedIn: false })
    expect(result.current).toEqual([])
  })

  it('does not update the cache when a new array reference holds the same content', () => {
    const firstRef = ['admin']
    const { result, rerender } = renderHook(
      ({ values, loading }) => useCachedAccessCredentials({ values, loading, isSignedIn: true }),
      { initialProps: { values: firstRef, loading: false } }
    )
    expect(result.current).toBe(firstRef)
    rerender({ values: [], loading: true })
    expect(result.current).toBe(firstRef)
    const secondRef = ['admin']
    rerender({ values: secondRef, loading: false })
    expect(result.current).toBe(secondRef)
    rerender({ values: [], loading: true })
    expect(result.current).toBe(firstRef)
  })

  it('updates the cache when loading is false and values change to new non-empty content', () => {
    const { result, rerender } = renderHook(
      ({ values }) => useCachedAccessCredentials({ values, loading: false, isSignedIn: true }),
      { initialProps: { values: ['admin'] } }
    )
    expect(result.current).toEqual(['admin'])
    rerender({ values: ['pastor'] })
    expect(result.current).toEqual(['pastor'])
  })
})
