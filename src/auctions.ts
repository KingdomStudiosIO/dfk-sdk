import { constants, utils } from 'ethers'
import { HERO_AUCTION_ABI } from './abis'
import { getContractAddress, type ContractName } from './addresses'
import type { ChainContext } from './context'
import { multicall } from './multicall'

/** An open listing on one of the game's clock auctions (heroes, pets, equipment). */
export interface AuctionListing {
  seller: string
  /** Prices are in the chain's power token (CRYSTAL / JADE), 18 decimals. */
  startingPrice: bigint
  endingPrice: bigint
  startedAt: Date
  durationSeconds: number
  /** Set for private sales: the only address allowed to buy. */
  privateBuyer?: string
}

// Every auction contract shares this layout, so one interface reads them all.
export const auctionIface = new utils.Interface(HERO_AUCTION_ABI as any)

export function parseAuction(raw: any): AuctionListing | undefined {
  if (!raw || raw.seller === constants.AddressZero) return undefined
  const winner: string | undefined = raw.winner
  return {
    seller: raw.seller,
    startingPrice: BigInt(raw.startingPrice.toString()),
    endingPrice: BigInt(raw.endingPrice.toString()),
    startedAt: new Date(Number(raw.startedAt) * 1000),
    durationSeconds: Number(raw.duration),
    ...(winner && winner !== constants.AddressZero ? { privateBuyer: winner } : {}),
  }
}

/** Price right now: clock auctions move linearly from starting to ending price over the duration. */
export function getAuctionPrice(listing: AuctionListing, now: Date = new Date()): bigint {
  const elapsed = Math.max(0, (now.getTime() - listing.startedAt.getTime()) / 1000)
  if (listing.durationSeconds <= 0 || elapsed >= listing.durationSeconds) return listing.endingPrice
  const delta = listing.endingPrice - listing.startingPrice
  return listing.startingPrice + (delta * BigInt(Math.floor(elapsed))) / BigInt(listing.durationSeconds)
}

/**
 * Tokens held by an auction contract are listed for sale. Given token owners, looks up the
 * listings for the ones the auction holds.
 */
export async function getListingsForHeldTokens(
  ctx: ChainContext,
  auctionName: ContractName,
  owners: ReadonlyMap<string, string>
): Promise<Map<string, AuctionListing>> {
  const listings = new Map<string, AuctionListing>()
  const auction = getContractAddress(auctionName, ctx.chainId)
  if (!auction) return listings
  const listedIds = [...owners].filter(([, o]) => o.toLowerCase() === auction.toLowerCase()).map(([id]) => id)
  if (listedIds.length === 0) return listings

  const results = await multicall(
    ctx.provider,
    ctx.chainId,
    listedIds.map(id => ({ target: auction, iface: auctionIface, method: 'getAuctions', args: [[id]] }))
  )
  results.forEach((r, i) => {
    const listing = r.success ? parseAuction(r.value[0]) : undefined
    if (listing) listings.set(listedIds[i], listing)
  })
  return listings
}
