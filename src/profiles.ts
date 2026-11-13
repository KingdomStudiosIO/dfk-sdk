import { Contract } from 'ethers'
import { PROFILES_ABI } from './abis'
import { requireContractAddress } from './addresses'
import type { ChainContext } from './context'

export interface Profile {
  id: string
  owner: string
  name: string
  createdAt: Date
  picId: number
  /** Hero used as the profile picture, if set. */
  heroId: string | null
}

/** On-chain player profile, or `null` if the address hasn't created one. */
export async function getProfile(ctx: ChainContext, address: string): Promise<Profile | null> {
  const profiles = new Contract(requireContractAddress('profiles', ctx.chainId), PROFILES_ABI as any, ctx.provider)
  try {
    const p = await profiles.getProfileByAddress(address)
    if (!p._name) return null
    return {
      id: p._id.toString(),
      owner: p._owner,
      name: p._name,
      createdAt: new Date(Number(p._created) * 1000),
      picId: Number(p._picId),
      heroId: p._heroId.isZero() ? null : p._heroId.toString(),
    }
  } catch {
    // The contract reverts for addresses without a profile.
    return null
  }
}
