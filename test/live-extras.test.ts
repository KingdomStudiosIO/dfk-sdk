/**
 * Live checks for pets, equipment, the market reader and Metis heroes. Hits real RPCs.
 *   DFK_LIVE=1 DFK_LIVE_CHAIN=8217 npx vitest run test/live-extras.test.ts
 */
import { describe, expect, it } from 'vitest'
import { ChainId, createDFKClient, getContractAddress, getPetSpriteUrl, type EquipmentKind, type Hero } from '../src'

const live = process.env.DFK_LIVE ? describe : describe.skip
const CHAIN = Number(process.env.DFK_LIVE_CHAIN ?? ChainId.KAIA_MAINNET)
const LOOKBACK = Number(process.env.DFK_LIVE_LOOKBACK ?? 30_000)
const SECOND_ACCESSORY: Record<number, string> = { [ChainId.DFK_MAINNET]: '1000000000100', [ChainId.KAIA_MAINNET]: '2000000000100' }
const FIRST_ID: Record<number, string> = {
  [ChainId.DFK_MAINNET]: '1000000000001',
  [ChainId.KAIA_MAINNET]: '2000000000001',
  // C-Chain only holds migrated assets so far; hero #1 was migrated from Serendale.
  [ChainId.AVALANCHE_MAINNET]: '1',
}
// A piece of equipment known to exist: the realm's first armor, except where noted.
const FIRST_GEAR: Record<number, [EquipmentKind, string]> = {
  // No armor on C-Chain yet; a weapon migrated from DFK Chain.
  [ChainId.AVALANCHE_MAINNET]: ['weapon', '1000000000022'],
}

live(`live extras: chain ${CHAIN}`, () => {
  const dfk = createDFKClient({ chainId: CHAIN, rpcUrl: process.env.DFK_LIVE_RPC })

  it('reads marketplace activity from logs', async ({ skip }) => {
    if (!getContractAddress('heroAuction', CHAIN)) skip()
    const head = await dfk.provider.getBlockNumber()
    const events = await dfk.market.events('heroes', { fromBlock: head - LOOKBACK, toBlock: head })
    console.log(`hero market: ${events.length} events in ${LOOKBACK} blocks`, events.slice(-3))
    expect(Array.isArray(events)).toBe(true)

    const listings = await dfk.market.recentListings('heroes', { lookbackBlocks: LOOKBACK })
    for (const l of listings) {
      expect(l.currentPrice >= 0n).toBe(true)
      expect(l.seller).toMatch(/^0x/)
    }
    if (listings[0]) {
      const listing = await dfk.market.listing('heroes', listings[0].tokenId)
      expect(listing?.seller).toBe(listings[0].seller)
      const hero = await dfk.heroes.get(listings[0].tokenId)
      expect(hero?.sale?.seller).toBe(listings[0].seller)
    }
    console.log(`${listings.length} open hero listings; cheapest`, listings[0])
  }, 120_000)

  it('reads pets from an owner', async () => {
    // The owner of the realm's first hero; DFK_LIVE_OWNER overrides.
    const owner = process.env.DFK_LIVE_OWNER ?? (await dfk.heroes.get(FIRST_ID[CHAIN]))!.owner!
    const ids = await dfk.pets.idsByOwner(owner)
    expect(ids.length, `${owner} has no pets; set DFK_LIVE_OWNER`).toBeGreaterThan(0)
    const pet = await dfk.pets.get(ids[0])
    expect(pet).not.toBeNull()
    expect(pet!.species).toBeDefined()
    expect(getPetSpriteUrl(pet!)).toMatch(/^https:\/\/.+\.png$/)
    console.log(pet!.name, pet!.rarity, pet!.eggType, pet!.gathering, pet!.combat, getPetSpriteUrl(pet!))

    const owned = await dfk.pets.byOwner(pet!.owner!)
    expect(owned.some(p => p.id === pet!.id)).toBe(true)
    const res = await fetch(getPetSpriteUrl(pet!)!)
    expect(res.ok).toBe(true)
  }, 120_000)

  it('resolves equipment on a geared hero', async () => {
    const [kind, id] = FIRST_GEAR[CHAIN] ?? ['armor', FIRST_ID[CHAIN]]
    const [piece] = await dfk.equipment.get(kind, [id])
    expect(piece).toBeDefined()
    expect(piece.name).not.toMatch(/Unknown/)
    console.log(piece.name, piece.typeName, piece.rarity, piece.bonuses.map(b => b.text), piece.image)
    expect((await fetch(piece.image)).ok).toBe(true)

    const accessoryId = process.env.DFK_LIVE_ACCESSORY ?? SECOND_ACCESSORY[CHAIN]
    if (!accessoryId) return
    const [accessory] = await dfk.equipment.get('accessory', [accessoryId])
    expect(['accessory', 'offhand']).toContain(accessory.kind)
    console.log(accessory.name, accessory.kind, accessory.typeName, accessory.bonuses.map(b => b.text))

    // That owner is a large dev wallet whose id lists time out on public RPCs, so list the
    // gear of the accessory's owner instead.
    const gear = await dfk.equipment.byOwner(accessory.owner!)
    expect(gear.some(g => g.id === accessory.id)).toBe(true)

    // Find one of the owner's heroes with something equipped and resolve it.
    const heroes: Hero[] = await dfk.heroes.byOwner(accessory.owner!)
    const geared = heroes.find(h => h.equipment.weapon1Id || h.equipment.armorId || h.equipment.accessoryId)
    if (geared) {
      const resolved = await dfk.equipment.forHero(geared)
      const names = Object.entries(resolved).filter(([, e]) => e).map(([slot, e]) => `${slot}: ${e!.name}`)
      expect(names.length).toBeGreaterThan(0)
      console.log(geared.name, names)
    }
  }, 180_000)

  it('returns nothing for unknown pets and equipment', async () => {
    expect(await dfk.pets.get('999999999999999')).toBeNull()
    expect(await dfk.equipment.get('armor', ['999999999999999'])).toEqual([])
  }, 30_000)
})

const metis = process.env.DFK_LIVE ? describe : describe.skip
metis('live: Metis heroes', () => {
  const dfk = createDFKClient({ chainId: ChainId.METIS_MAINNET })

  it('joins chain state with indexer genes', async () => {
    const head = await dfk.provider.getBlockNumber()
    const events = await dfk.market.events('heroes', { fromBlock: head - 200_000, toBlock: head, blockRange: 10_000 })
    const id = events.at(-1)?.tokenId
    expect(id, 'no Metis hero market activity found').toBeDefined()
    const hero = await dfk.heroes.get(id!)
    expect(hero).not.toBeNull()
    expect(hero!.class).toBeDefined()
    console.log(hero!.name, hero!.class, hero!.level, hero!.owner, hero!.incomplete ? '(no genes)' : hero!.visualGenes.gender.d)

    const owned = await dfk.heroes.byOwner(hero!.owner!)
    expect(owned.some(h => h.id === hero!.id)).toBe(true)
    expect(owned.every(h => !h.incomplete)).toBe(true)
  }, 180_000)
})
