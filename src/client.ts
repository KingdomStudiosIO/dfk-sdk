import { providers, type Signer } from 'ethers'
import { getChain, type ChainConfig } from './chains'
import type { AssetConfig } from './config'
import type { ChainContext } from './context'
import {
  getHero,
  getHeroAtlasUrl,
  getHeroes,
  getHeroesByOwner,
  getHeroIdsByOwner,
  getHeroImageUrl,
  getHeroSkeletonUrl,
  type Hero,
} from './heroes'
import { getItem, getItemBalance, getItemBalances, getItemImageUrl, getItems, type ItemDefinition } from './items'
import { getEquipment, getEquipmentByOwner, getEquipmentImageUrl, getHeroGear, type EquipmentContractKind, type EquipmentKind } from './equipment'
import type { HeroEquipment } from './heroes/types'
import {
  getListing,
  getListingsBySeller,
  getMarketEvents,
  getRecentListings,
  getRecentSales,
  type MarketEventQuery,
  type MarketName,
} from './market'
import { getPet, getPetCardArt, getPetIdsByOwner, getPets, getPetsByOwner, getPetSpriteUrl, type Pet } from './pets'
import { getProfile } from './profiles'
import { createDFKWriter } from './write'
import { getPowerToken, getTokenBalances, getTokens, type TokenDefinition } from './tokens'

export interface DFKClientOptions {
  chainId: number
  /** Any ethers v5 provider. Takes precedence over `rpcUrl`. */
  provider?: providers.Provider
  /** Defaults to the chain's public RPC. */
  rpcUrl?: string
  /** Override where hero renders and bundled assets load from. */
  assets?: Partial<AssetConfig>
  /** Metis only: the service that serves hero genes (see `METIS_HERO_INDEXER_URL`). */
  metisIndexerUrl?: string
}

export type DFKClient = ReturnType<typeof createDFKClient>

/**
 * One chain, one provider, every read the SDK offers.
 *
 * ```ts
 * const dfk = createDFKClient({ chainId: ChainId.KAIA_MAINNET })
 * const heroes = await dfk.heroes.byOwner('0x…')
 * ```
 */
export function createDFKClient(options: DFKClientOptions) {
  const chain: ChainConfig = getChain(options.chainId)
  const provider =
    options.provider ??
    new providers.StaticJsonRpcProvider(options.rpcUrl ?? chain.rpcUrls[0], { chainId: chain.id, name: chain.name })
  const ctx: ChainContext = { provider, chainId: chain.id, metisIndexerUrl: options.metisIndexerUrl }
  const assets = options.assets

  return {
    chain,
    chainId: chain.id,
    provider,
    /** Asset overrides this client was created with. */
    assets,
    heroes: {
      get: (id: bigint | string | number) => getHero(ctx, id),
      getMany: (ids: readonly (bigint | string | number)[]) => getHeroes(ctx, ids),
      idsByOwner: (owner: string, opts?: { includeListed?: boolean }) => getHeroIdsByOwner(ctx, owner, opts),
      byOwner: (owner: string, opts?: { includeListed?: boolean }) => getHeroesByOwner(ctx, owner, opts),
      imageUrl: (hero: Pick<Hero, 'id' | 'equipment'>) => getHeroImageUrl({ ...hero, chainId: chain.id }, assets),
      atlasUrl: (hero: Pick<Hero, 'id' | 'equipment'>) => getHeroAtlasUrl({ ...hero, chainId: chain.id }, assets),
      skeletonUrl: () => getHeroSkeletonUrl(assets),
    },
    items: {
      list: (opts?: { includeHidden?: boolean; includeCurrencies?: boolean }) => getItems(chain.id, opts),
      get: (key: string) => getItem(key),
      balances: (owner: string, opts?: { items?: readonly ItemDefinition[]; includeZero?: boolean }) =>
        getItemBalances(ctx, owner, opts),
      balance: (owner: string, item: ItemDefinition) => getItemBalance(ctx, owner, item),
      imageUrl: (item: ItemDefinition) => getItemImageUrl(item, assets),
    },
    tokens: {
      list: () => getTokens(chain.id),
      powerToken: () => getPowerToken(chain.id),
      balances: (owner: string, opts?: { tokens?: readonly TokenDefinition[]; includeZero?: boolean }) =>
        getTokenBalances(ctx, owner, opts),
    },
    profiles: {
      get: (address: string) => getProfile(ctx, address),
    },
    pets: {
      get: (id: bigint | string | number) => getPet(ctx, id),
      getMany: (ids: readonly (bigint | string | number)[]) => getPets(ctx, ids),
      idsByOwner: (owner: string, opts?: { includeListed?: boolean }) => getPetIdsByOwner(ctx, owner, opts),
      byOwner: (owner: string, opts?: { includeListed?: boolean }) => getPetsByOwner(ctx, owner, opts),
      spriteUrl: (pet: Pick<Pet, 'species'>) => getPetSpriteUrl(pet, assets),
      cardArt: (pet: Pick<Pet, 'rarity' | 'backgroundId' | 'element'>) => getPetCardArt(pet, assets),
    },
    equipment: {
      get: (kind: EquipmentKind, ids: readonly (bigint | string | number)[]) => getEquipment(ctx, kind, ids),
      byOwner: (owner: string, opts?: { kinds?: readonly EquipmentContractKind[]; includeListed?: boolean }) =>
        getEquipmentByOwner(ctx, owner, opts),
      /** Resolves a hero's equipped ids (including visages) into full items. */
      forHero: (hero: { equipment: HeroEquipment }) => getHeroGear(ctx, hero),
      imageUrl: (item: { kind: EquipmentKind; typeId: number; displayId: number }) =>
        getEquipmentImageUrl(item.kind, item.typeId, item.displayId, assets),
    },
    market: {
      events: (market: MarketName, query: MarketEventQuery) => getMarketEvents(ctx, market, query),
      listing: (market: MarketName, tokenId: bigint | string | number) => getListing(ctx, market, tokenId),
      listingsBySeller: (market: MarketName, seller: string) => getListingsBySeller(ctx, market, seller),
      recentListings: (market: MarketName, opts?: { lookbackBlocks?: number; blockRange?: number }) =>
        getRecentListings(ctx, market, opts),
      recentSales: (market: MarketName, opts?: { lookbackBlocks?: number; blockRange?: number }) =>
        getRecentSales(ctx, market, opts),
    },
    /** Write actions signed by `signer` (which must be connected to this chain). */
    connect: (signer: Signer) => createDFKWriter(signer, chain.id),
  }
}
