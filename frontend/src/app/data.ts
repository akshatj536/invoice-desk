import { useCallback, useEffect, useRef, useState } from 'react'

/** Fetch + poll. `interval` may depend on the data (e.g. faster while something is processing). */
export function usePoll<T>(fetcher: () => Promise<T>, interval: number | ((d: T | null) => number) = 5000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const dataRef = useRef<T | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await fetchRef.current()
      dataRef.current = d
      setData(d)
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout>
    const tick = async () => {
      await load()
      if (!alive) return
      const ms = typeof interval === 'function' ? interval(dataRef.current) : interval
      t = setTimeout(tick, ms)
    }
    tick()
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  return { data, error, reload: load }
}
