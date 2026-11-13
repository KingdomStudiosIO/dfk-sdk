import { Contract, utils } from 'ethers'
import { HERO_AUCTION_ABI, HERO_CORE_ABI, PVP_CORE_ABI } from '../abis'
import { getContractAddress, requireContractAddress } from '../addresses'
import { getListingsForHeldTokens } from '../auctions'
import { getChain } from '../chains'
import type { ChainContext } from '../context'
import { multicall } from '../multicall'
import { fetchMetisHeroGenes, parseMetisHero, type MetisHeroGenes } from './metis'
import { parseHeroV3 } from './parse'
import type { Hero } from './types'

type IdInput = bigint | string | number

const heroCoreIface = new utils.Interface(HERO_CORE_ABI as any)
const pvpCoreIface = new utils.Interface(PVP_CORE_ABI as any)
const ID_PAGE_SIZE = 1000

const isMetis = (chainId: number) => getChain(chainId).heroes === 'metis'

function heroCore(ctx: ChainContext) {
  return new Contract(requireContractAddress('heroCore', ctx.chainId), HERO_CORE_ABI as any, ctx.provider)
}

/** Fetches one hero, or `null` if it doesn't exist on this chain. */
export async function getHero(ctx: ChainContext, heroId: IdInput): Promise<Hero | null> {
  const [hero] = await getHeroes(ctx, [heroId])
  return hero ?? null
}

/**
 * Fetches many heroes in batched multicalls. Ids that don't exist on this chain are skipped,
 * so the result may be shorter than the input; match on `hero.id`.
 *
 * On Metis, genes are looked up per owner from the hero indexer. Pass `metisGenes` if you
 * already have them to skip that request.
 */
export async function getHeroes(
  ctx: ChainContext,
  heroIds: readonly IdInput[],
  { includeOwners = true, metisGenes }: { includeOwners?: boolean; metisGenes?: readonly MetisHeroGenes[] } = {}
): Promise<Hero[]> {
  if (heroIds.length === 0) return []
  const ids = [...new Set(heroIds.map(id => id.toString()))]
  if (isMetis(ctx.chainId)) return getMetisHeroes(ctx, ids, metisGenes)

  const core = requireContractAddress('heroCore', ctx.chainId)
  const [heroResults, owners] = await Promise.all([
    multicall(
      ctx.provider,
      ctx.chainId,
      ids.map(id => ({ target: core, iface: heroCoreIface, method: 'getHeroV3', args: [id] })),
      { batchSize: 50 }
    ),
    includeOwners ? getOwners(ctx, core, heroCoreIface, ids) : Promise.resolve(new Map<string, string>()),
  ])
  const sales = await getListingsForHeldTokens(ctx, 'heroAuction', owners)

  const heroes: Hero[] = []
  heroResults.forEach((r, i) => {
    // Unknown ids return a zero-filled struct rather than reverting.
    if (!r.success || r.value.summoningInfo.summonedTime.isZero()) return
    const sale = sales.get(ids[i])
    heroes.push(parseHeroV3(r.value, ctx.chainId, { owner: sale?.seller ?? owners.get(ids[i]), sale }))
  })
  return heroes
}

async function getMetisHeroes(ctx: ChainContext, ids: string[], knownGenes?: readonly MetisHeroGenes[]): Promise<Hero[]> {
  const core = requireContractAddress('pvpCore', ctx.chainId)
  const [heroResults, owners] = await Promise.all([
    multicall(
      ctx.provider,
      ctx.chainId,
      // `getHeroes` reverts on unknown ids, so ask for each hero separately.
      ids.map(id => ({ target: core, iface: pvpCoreIface, method: 'getHeroes', args: [[id]] })),
      { batchSize: 50 }
    ),
    getOwners(ctx, core, pvpCoreIface, ids),
  ])
  const sales = await getListingsForHeldTokens(ctx, 'heroAuction', owners)

  const genes = new Map((knownGenes ?? []).map(g => [g.id, g]))
  const realOwners = new Set(ids.map(id => (sales.get(id)?.seller ?? owners.get(id))?.toLowerCase()).filter(Boolean) as string[])
  if (!knownGenes) {
    // The indexer is keyed by owner. A failed lookup leaves those heroes marked `incomplete`.
    const lists = await Promise.allSettled([...realOwners].map(o => fetchMetisHeroGenes(ctx, o)))
    lists.forEach(l => l.status === 'fulfilled' && l.value.forEach(g => genes.set(g.id, g)))
  }

  const heroes: Hero[] = []
  heroResults.forEach((r, i) => {
    const raw = r.success ? r.value[0] : undefined
    if (!raw || raw.id.isZero()) return
    const sale = sales.get(ids[i])
    const g = genes.get(ids[i])
    heroes.push(
      parseMetisHero(raw, ctx.chainId, {
        owner: sale?.seller ?? owners.get(ids[i]),
        sale,
        genes: g && { stat: g.stat_genes, visual: g.visual_genes },
      })
    )
  })
  return heroes
}

async function getOwners(ctx: ChainContext, target: string, iface: utils.Interface, ids: string[]) {
  const results = await multicall<string>(
    ctx.provider,
    ctx.chainId,
    ids.map(id => ({ target, iface, method: 'ownerOf', args: [id] }))
  )
  const owners = new Map<string, string>()
  results.forEach((r, i) => r.success && owners.set(ids[i], r.value))
  return owners
}

/** Ids of every hero an address owns, including heroes it has listed for sale. */
export async function getHeroIdsByOwner(
  ctx: ChainContext,
  owner: string,
  { includeListed = true }: { includeListed?: boolean } = {}
): Promise<string[]> {
  const auctionAddress = getContractAddress('heroAuction', ctx.chainId)
  const [held, listed] = await Promise.all([
    isMetis(ctx.chainId)
      ? fetchMetisHeroGenes(ctx, owner).then(list => list.map(h => h.id))
      : getAllUserHeroIds(heroCore(ctx), owner),
    includeListed && auctionAddress
      ? new Contract(auctionAddress, HERO_AUCTION_ABI as any, ctx.provider).getUserAuctions(owner)
      : Promise.resolve([]),
  ])
  return [...new Set([...held, ...listed].map((id: { toString(): string }) => id.toString()))]
}

/** Every hero an address owns, with sale info on the ones it has listed. */
export async function getHeroesByOwner(
  ctx: ChainContext,
  owner: string,
  opts?: { includeListed?: boolean }
): Promise<Hero[]> {
  if (isMetis(ctx.chainId)) {
    // One indexer call gives both the ids and their genes. Listed heroes are held by the
    // auction, so the indexer may not return them; fall back to per-owner lookups then.
    const auctionAddress = getContractAddress('heroAuction', ctx.chainId)
    const [genes, listed] = await Promise.all([
      fetchMetisHeroGenes(ctx, owner),
      (opts?.includeListed ?? true) && auctionAddress
        ? new Contract(auctionAddress, HERO_AUCTION_ABI as any, ctx.provider).getUserAuctions(owner)
        : Promise.resolve([]),
    ])
    const ids = [...new Set([...genes.map(g => g.id), ...listed.map((id: { toString(): string }) => id.toString())])]
    const complete = ids.every(id => genes.some(g => g.id === id))
    return getHeroes(ctx, ids, complete ? { metisGenes: genes } : {})
  }
  const ids = await getHeroIdsByOwner(ctx, owner, opts)
  return getHeroes(ctx, ids)
}

async function getAllUserHeroIds(core: Contract, owner: string): Promise<{ toString(): string }[]> {
  try {
    return await core.getUserHeroes(owner)
  } catch {
    // Very large wallets can exceed the RPC response limit; page through instead.
    const all: { toString(): string }[] = []
    for (let offset = 0; ; offset += ID_PAGE_SIZE) {
      const page = await core.getUserHeroesWithOffset(owner, offset, ID_PAGE_SIZE)
      all.push(...page)
      if (page.length < ID_PAGE_SIZE) return all
    }
  }
}
