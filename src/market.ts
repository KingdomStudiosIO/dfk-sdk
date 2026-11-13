import { Contract, constants, type providers } from 'ethers'
import { getContractAddress, requireContractAddress, type ContractName } from './addresses'
import { auctionIface, getAuctionPrice, parseAuction, type AuctionListing } from './auctions'
import { getChain } from './chains'
import type { ChainContext } from './context'

/** The game's marketplaces. Each is a clock auction contract with the same interface. */
export type MarketName = 'heroes' | 'pets' | 'weapons' | 'armor' | 'accessories'

export const MARKET_CONTRACTS: Record<MarketName, ContractName> = {
  heroes: 'heroAuction',
  pets: 'petAuction',
  weapons: 'weaponAuction',
  armor: 'armorAuction',
  accessories: 'accessoryAuction',
}

export interface MarketEventBase {
  market: MarketName
  tokenId: string
  auctionId: string
  blockNumber: number
  transactionHash: string
  logIndex: number
  /** Present when fetched with `timestamps: true`. */
  timestamp?: Date
}

export type MarketEvent =
  | (MarketEventBase & {
      type: 'listed'
      seller: string
      startingPrice: bigint
      endingPrice: bigint
      durationSeconds: number
      privateBuyer?: string
    })
  | (MarketEventBase & { type: 'sold'; price: bigint; buyer: string })
  | (MarketEventBase & { type: 'cancelled' })

export type MarketEventType = MarketEvent['type']

const EVENT_NAMES: Record<MarketEventType, string> = {
  listed: 'AuctionCreated',
  sold: 'AuctionSuccessful',
  cancelled: 'AuctionCancelled',
}

export interface MarketEventQuery {
  fromBlock: number
  /** Defaults to the latest block. */
  toBlock?: number
  types?: readonly MarketEventType[]
  /** Blocks per `eth_getLogs` request. Defaults to the chain's `logBlockRange` (2048 if unset). */
  blockRange?: number
  /** Look up block timestamps for each event (one extra request per distinct block). */
  timestamps?: boolean
}

/**
 * Reads marketplace activity straight from chain logs: listings, sales and cancellations.
 * This replaces the game's retired indexer API for sale history.
 *
 * ```ts
 * const head = await dfk.provider.getBlockNumber()
 * const sales = await dfk.market.events('heroes', { fromBlock: head - 5000, types: ['sold'] })
 * ```
 */
export async function getMarketEvents(
  ctx: ChainContext,
  market: MarketName,
  { fromBlock, toBlock, types = ['listed', 'sold', 'cancelled'], blockRange = getChain(ctx.chainId).logBlockRange ?? 2048, timestamps = false }: MarketEventQuery
): Promise<MarketEvent[]> {
  const address = requireContractAddress(MARKET_CONTRACTS[market], ctx.chainId)
  const end = toBlock ?? (await ctx.provider.getBlockNumber())
  const topics = [types.map(t => auctionIface.getEventTopic(EVENT_NAMES[t]))]

  const ranges: [number, number][] = []
  for (let from = Math.max(0, fromBlock); from <= end; from += blockRange) ranges.push([from, Math.min(end, from + blockRange - 1)])

  // A few requests in flight at once keeps public RPCs happy.
  const logs: providers.Log[] = []
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = await Promise.all(
      ranges.slice(i, i + 4).map(([from, to]) => ctx.provider.getLogs({ address, topics, fromBlock: from, toBlock: to }))
    )
    batch.forEach(b => logs.push(...b))
  }

  const events = logs.map(log => parseMarketLog(market, log)).filter((e): e is MarketEvent => e !== null)
  events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)

  if (timestamps) {
    const blocks = [...new Set(events.map(e => e.blockNumber))]
    const times = new Map<number, Date>()
    for (let i = 0; i < blocks.length; i += 10) {
      const chunk = blocks.slice(i, i + 10)
      const fetched = await Promise.all(chunk.map(b => ctx.provider.getBlock(b)))
      fetched.forEach((b, j) => times.set(chunk[j], new Date(b.timestamp * 1000)))
    }
    events.forEach(e => (e.timestamp = times.get(e.blockNumber)))
  }
  return events
}

/** Decodes one auction log; returns null for unrelated events. */
export function parseMarketLog(market: MarketName, log: providers.Log): MarketEvent | null {
  let parsed
  try {
    parsed = auctionIface.parseLog(log)
  } catch {
    return null
  }
  const base = {
    market,
    tokenId: parsed.args.tokenId.toString(),
    auctionId: parsed.args.auctionId.toString(),
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }
  switch (parsed.name) {
    case 'AuctionCreated': {
      const winner: string = parsed.args.winner
      return {
        ...base,
        type: 'listed',
        seller: parsed.args.owner,
        startingPrice: BigInt(parsed.args.startingPrice.toString()),
        endingPrice: BigInt(parsed.args.endingPrice.toString()),
        durationSeconds: Number(parsed.args.duration),
        ...(winner !== constants.AddressZero ? { privateBuyer: winner } : {}),
      }
    }
    case 'AuctionSuccessful':
      return { ...base, type: 'sold', price: BigInt(parsed.args.totalPrice.toString()), buyer: parsed.args.winner }
    case 'AuctionCancelled':
      return { ...base, type: 'cancelled' }
    default:
      return null
  }
}

function auctionContract(ctx: ChainContext, market: MarketName) {
  return new Contract(requireContractAddress(MARKET_CONTRACTS[market], ctx.chainId), auctionIface, ctx.provider)
}

/** The open listing for a token, or null if it isn't for sale. */
export async function getListing(ctx: ChainContext, market: MarketName, tokenId: string | number | bigint): Promise<AuctionListing | null> {
  const [raw] = await auctionContract(ctx, market).getAuctions([tokenId.toString()])
  return (raw?.open !== false && parseAuction(raw)) || null
}

/** Open listings by one seller, keyed by token id. */
export async function getListingsBySeller(ctx: ChainContext, market: MarketName, seller: string): Promise<Map<string, AuctionListing>> {
  const auction = auctionContract(ctx, market)
  const ids: { toString(): string }[] = await auction.getUserAuctions(seller)
  const out = new Map<string, AuctionListing>()
  if (ids.length === 0) return out
  const raws = await auction.getAuctions(ids.map(String))
  raws.forEach((raw: any) => {
    const listing = raw.open !== false ? parseAuction(raw) : undefined
    if (listing) out.set(raw.tokenId.toString(), listing)
  })
  return out
}

export interface OpenListing extends AuctionListing {
  market: MarketName
  tokenId: string
  /** Price at the time of the call. */
  currentPrice: bigint
}

/**
 * Listings created in the last `lookbackBlocks` blocks that are still open, cheapest first.
 * A window keeps it fast on public RPCs; widen it to see older listings.
 */
export async function getRecentListings(
  ctx: ChainContext,
  market: MarketName,
  { lookbackBlocks = 20_000, blockRange }: { lookbackBlocks?: number; blockRange?: number } = {}
): Promise<OpenListing[]> {
  if (!getContractAddress(MARKET_CONTRACTS[market], ctx.chainId)) return []
  const head = await ctx.provider.getBlockNumber()
  const events = await getMarketEvents(ctx, market, { fromBlock: head - lookbackBlocks, toBlock: head, types: ['listed'], blockRange })
  const ids = [...new Set(events.map(e => e.tokenId))]
  if (ids.length === 0) return []

  const auction = auctionContract(ctx, market)
  const raws: any[] = []
  for (let i = 0; i < ids.length; i += 200) raws.push(...(await auction.getAuctions(ids.slice(i, i + 200))))
  const now = new Date()
  return raws
    .map((raw, i) => {
      const listing = raw.open !== false ? parseAuction(raw) : undefined
      return listing && { ...listing, market, tokenId: ids[i], currentPrice: getAuctionPrice(listing, now) }
    })
    .filter((l): l is OpenListing => Boolean(l))
    .sort((a, b) => (a.currentPrice < b.currentPrice ? -1 : a.currentPrice > b.currentPrice ? 1 : 0))
}

/** Completed sales in the last `lookbackBlocks` blocks, newest first, with timestamps. */
export async function getRecentSales(
  ctx: ChainContext,
  market: MarketName,
  { lookbackBlocks = 20_000, blockRange }: { lookbackBlocks?: number; blockRange?: number } = {}
): Promise<Extract<MarketEvent, { type: 'sold' }>[]> {
  if (!getContractAddress(MARKET_CONTRACTS[market], ctx.chainId)) return []
  const head = await ctx.provider.getBlockNumber()
  const events = await getMarketEvents(ctx, market, {
    fromBlock: head - lookbackBlocks,
    toBlock: head,
    types: ['sold'],
    blockRange,
    timestamps: true,
  })
  return (events as Extract<MarketEvent, { type: 'sold' }>[]).reverse()
}
