import { Contract, utils } from 'ethers'
import { PET_AUCTION_ABI, PET_CORE_ABI } from '../abis'
import { getContractAddress, requireContractAddress } from '../addresses'
import { getListingsForHeldTokens } from '../auctions'
import type { ChainContext } from '../context'
import { multicall } from '../multicall'
import { parsePetV2 } from './parse'
import type { Pet } from './types'

type IdInput = bigint | string | number

const petCoreIface = new utils.Interface(PET_CORE_ABI as any)
const ID_PAGE_SIZE = 1000

/** Fetches one pet, or `null` if it doesn't exist on this chain. */
export async function getPet(ctx: ChainContext, petId: IdInput): Promise<Pet | null> {
  const [pet] = await getPets(ctx, [petId])
  return pet ?? null
}

/**
 * Fetches many pets in batched multicalls. Unknown ids are skipped, so match on `pet.id`.
 */
export async function getPets(ctx: ChainContext, petIds: readonly IdInput[]): Promise<Pet[]> {
  if (petIds.length === 0) return []
  const ids = [...new Set(petIds.map(id => id.toString()))]
  const core = requireContractAddress('petCore', ctx.chainId)

  const [petResults, ownerResults] = await Promise.all([
    multicall(
      ctx.provider,
      ctx.chainId,
      ids.map(id => ({ target: core, iface: petCoreIface, method: 'getPetV2', args: [id] })),
      { batchSize: 100 }
    ),
    multicall<string>(
      ctx.provider,
      ctx.chainId,
      ids.map(id => ({ target: core, iface: petCoreIface, method: 'ownerOf', args: [id] }))
    ),
  ])
  const owners = new Map<string, string>()
  ownerResults.forEach((r, i) => r.success && owners.set(ids[i], r.value))
  const sales = await getListingsForHeldTokens(ctx, 'petAuction', owners)

  const pets: Pet[] = []
  petResults.forEach((r, i) => {
    // Unknown ids return a zero-filled struct, so existence is judged by ownership
    // (id 0 is a real pet on some chains).
    if (!r.success || !owners.has(ids[i])) return
    const sale = sales.get(ids[i])
    pets.push(parsePetV2(r.value, ctx.chainId, { owner: sale?.seller ?? owners.get(ids[i]), sale }))
  })
  return pets
}

/** Ids of every pet an address owns, including pets it has listed for sale. */
export async function getPetIdsByOwner(
  ctx: ChainContext,
  owner: string,
  { includeListed = true }: { includeListed?: boolean } = {}
): Promise<string[]> {
  const core = new Contract(requireContractAddress('petCore', ctx.chainId), PET_CORE_ABI as any, ctx.provider)
  const auction = getContractAddress('petAuction', ctx.chainId)
  const [held, listed] = await Promise.all([
    getAllUserPetIds(core, owner),
    includeListed && auction
      ? new Contract(auction, PET_AUCTION_ABI as any, ctx.provider).getUserAuctions(owner)
      : Promise.resolve([]),
  ])
  return [...new Set([...held, ...listed].map((id: { toString(): string }) => id.toString()))]
}

export async function getPetsByOwner(ctx: ChainContext, owner: string, opts?: { includeListed?: boolean }): Promise<Pet[]> {
  return getPets(ctx, await getPetIdsByOwner(ctx, owner, opts))
}

async function getAllUserPetIds(core: Contract, owner: string): Promise<{ toString(): string }[]> {
  try {
    return await core.getUserPetIds(owner)
  } catch {
    const all: { toString(): string }[] = []
    for (let offset = 0; ; offset += ID_PAGE_SIZE) {
      const page = await core.getUserPetIdsWithOffset(owner, offset, ID_PAGE_SIZE)
      all.push(...page)
      if (page.length < ID_PAGE_SIZE) return all
    }
  }
}
