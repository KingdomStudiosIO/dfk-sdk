import { useCallback, useEffect, useRef, useState } from 'react'
import type { DFKClient } from '../client'
import type { Equipment, EquipmentContractKind, EquipmentKind, HeroGear } from '../equipment/types'
import type { Hero } from '../heroes/types'
import type { MarketEvent, MarketName, OpenListing } from '../market'
import type { Pet } from '../pets/types'
import type { ItemBalance, ItemDefinition } from '../items/types'
import type { Profile } from '../profiles'
import type { TokenBalance, TokenDefinition } from '../tokens'
import { useDFK } from './context'

export interface QueryResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refetch: () => void
}

/**
 * Minimal async-query hook: re-runs when `key` changes, ignores stale responses,
 * and skips entirely while `key` is null. Swap in React Query or SWR by calling the
 * client methods directly if you need caching across components.
 */
export function useDFKQuery<T>(key: string | null, fetcher: (client: DFKClient) => Promise<T>): QueryResult<T> {
  const client = useDFK()
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: key !== null })
  const [nonce, setNonce] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (key === null) {
      setState({ loading: false })
      return
    }
    let cancelled = false
    setState(s => ({ data: s.data, loading: true }))
    fetcherRef.current(client).then(
      data => !cancelled && setState({ data, loading: false }),
      error => !cancelled && setState({ error: error instanceof Error ? error : new Error(String(error)), loading: false })
    )
    return () => {
      cancelled = true
    }
  }, [client, key, nonce])

  const refetch = useCallback(() => setNonce(n => n + 1), [])
  return { data: state.data, error: state.error, loading: state.loading, refetch }
}

type Id = string | number | bigint

export function useHero(heroId: Id | null | undefined): QueryResult<Hero | null> {
  return useDFKQuery(heroId == null ? null : `hero:${heroId}`, c => c.heroes.get(heroId!))
}

export function useHeroes(heroIds: readonly Id[] | null | undefined): QueryResult<Hero[]> {
  return useDFKQuery(heroIds ? `heroes:${heroIds.join(',')}` : null, c => c.heroes.getMany(heroIds!))
}

export function useHeroesByOwner(owner: string | null | undefined, opts?: { includeListed?: boolean }): QueryResult<Hero[]> {
  return useDFKQuery(owner ? `heroesByOwner:${owner}:${opts?.includeListed ?? true}` : null, c => c.heroes.byOwner(owner!, opts))
}

export function useItemBalances(
  owner: string | null | undefined,
  opts?: { items?: readonly ItemDefinition[]; includeZero?: boolean }
): QueryResult<ItemBalance[]> {
  const itemsKey = opts?.items?.map(i => i.key).join(',') ?? '*'
  return useDFKQuery(owner ? `items:${owner}:${itemsKey}:${opts?.includeZero ?? false}` : null, c => c.items.balances(owner!, opts))
}

export function useTokenBalances(
  owner: string | null | undefined,
  opts?: { tokens?: readonly TokenDefinition[]; includeZero?: boolean }
): QueryResult<TokenBalance[]> {
  const tokensKey = opts?.tokens?.map(t => t.symbol).join(',') ?? '*'
  return useDFKQuery(owner ? `tokens:${owner}:${tokensKey}:${opts?.includeZero ?? true}` : null, c => c.tokens.balances(owner!, opts))
}

export function useProfile(address: string | null | undefined): QueryResult<Profile | null> {
  return useDFKQuery(address ? `profile:${address}` : null, c => c.profiles.get(address!))
}

export function usePet(petId: Id | null | undefined): QueryResult<Pet | null> {
  return useDFKQuery(petId == null ? null : `pet:${petId}`, c => c.pets.get(petId!))
}

export function usePets(petIds: readonly Id[] | null | undefined): QueryResult<Pet[]> {
  return useDFKQuery(petIds ? `pets:${petIds.join(',')}` : null, c => c.pets.getMany(petIds!))
}

export function usePetsByOwner(owner: string | null | undefined, opts?: { includeListed?: boolean }): QueryResult<Pet[]> {
  return useDFKQuery(owner ? `petsByOwner:${owner}:${opts?.includeListed ?? true}` : null, c => c.pets.byOwner(owner!, opts))
}

export function useEquipment(kind: EquipmentKind, ids: readonly Id[] | null | undefined): QueryResult<Equipment[]> {
  return useDFKQuery(ids ? `equipment:${kind}:${ids.join(',')}` : null, c => c.equipment.get(kind, ids!))
}

export function useEquipmentByOwner(
  owner: string | null | undefined,
  opts?: { kinds?: readonly EquipmentContractKind[]; includeListed?: boolean }
): QueryResult<Equipment[]> {
  const key = owner ? `equipmentByOwner:${owner}:${opts?.kinds?.join(',') ?? '*'}:${opts?.includeListed ?? true}` : null
  return useDFKQuery(key, c => c.equipment.byOwner(owner!, opts))
}

/** Resolves a hero's equipped items (including visages). */
export function useHeroGear(hero: Pick<Hero, 'id' | 'equipment'> | null | undefined): QueryResult<HeroGear> {
  const key = hero ? `heroGear:${hero.id}:${JSON.stringify(hero.equipment)}` : null
  return useDFKQuery(key, c => c.equipment.forHero(hero!))
}

export function useRecentListings(market: MarketName | null, opts?: { lookbackBlocks?: number }): QueryResult<OpenListing[]> {
  return useDFKQuery(market ? `listings:${market}:${opts?.lookbackBlocks ?? ''}` : null, c => c.market.recentListings(market!, opts))
}

export function useRecentSales(
  market: MarketName | null,
  opts?: { lookbackBlocks?: number }
): QueryResult<Extract<MarketEvent, { type: 'sold' }>[]> {
  return useDFKQuery(market ? `sales:${market}:${opts?.lookbackBlocks ?? ''}` : null, c => c.market.recentSales(market!, opts))
}
