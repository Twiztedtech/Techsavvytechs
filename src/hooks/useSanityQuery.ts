import {useEffect, useState} from 'react'
import type {QueryParams} from '@sanity/client'
import {sanityClient} from '../sanity/client'

type QueryState<T> = {data: T | null; loading: boolean; error: string | null}

export function useSanityQuery<T>(query: string, params: QueryParams = {}): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({data: null, loading: true, error: null})
  const paramsKey = JSON.stringify(params)

  useEffect(() => {
    const controller = new AbortController()
    setState({data: null, loading: true, error: null})

    sanityClient
      .fetch<T>(query, JSON.parse(paramsKey), {signal: controller.signal})
      .then((data) => setState({data, loading: false, error: null}))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({data: null, loading: false, error: error instanceof Error ? error.message : 'Unable to load content.'})
      })

    return () => controller.abort()
  }, [query, paramsKey])

  return state
}
