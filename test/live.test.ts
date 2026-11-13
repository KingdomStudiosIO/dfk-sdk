/**
 * Hits real RPCs. Run with: DFK_LIVE=1 npx vitest run test/live.test.ts
 */
import { describe, expect, it } from 'vitest'
import { ChainId, createDFKClient, getContractAddress, getHeroImageUrl, getOriginRealm } from '../src'

const live = process.env.DFK_LIVE ? describe : describe.skip

// DFK_LIVE_CHAIN picks the chain (default Kaia); DFK_LIVE_HERO a hero known to exist there;
// DFK_LIVE_RPC overrides the chain's public RPC.
const CHAIN = Number(process.env.DFK_LIVE_CHAIN ?? ChainId.KAIA_MAINNET)
const DEFAULT_HERO: Record<number, string> = {
  [ChainId.DFK_MAINNET]: '1000000000001',
  [ChainId.KAIA_MAINNET]: '2000000000001',
  // C-Chain has no native mints yet; hero #1 was migrated from Serendale.
  [ChainId.AVALANCHE_MAINNET]: '1',
}

live(`live: chain ${CHAIN}`, () => {
  const dfk = createDFKClient({ chainId: CHAIN, rpcUrl: process.env.DFK_LIVE_RPC })
  const HERO_ID = process.env.DFK_LIVE_HERO ?? DEFAULT_HERO[CHAIN]

  it('reads a hero with decoded genes and an owner', async () => {
    const hero = await dfk.heroes.get(HERO_ID)
    expect(hero).not.toBeNull()
    expect(hero!.id).toBe(HERO_ID)
    expect(hero!.displayId).toBe('1')
    expect(hero!.originRealm).toBe(getOriginRealm(HERO_ID))
    if (BigInt(HERO_ID) > 1_000_000_000_000n) expect(hero!.originRealm).toBe(dfk.chain.realm)
    expect(hero!.owner).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(hero!.name.length).toBeGreaterThan(0)
    expect(hero!.class).toBeDefined()
    console.log(hero!.name, hero!.class, hero!.rarity, `lvl ${hero!.level}`, hero!.owner, getHeroImageUrl(hero!))
  }, 30_000)

  it('lists an owner’s heroes, then their items and tokens', async () => {
    const hero = await dfk.heroes.get(HERO_ID)
    const owner = hero!.owner!
    const ids = await dfk.heroes.idsByOwner(owner)
    expect(ids).toContain(HERO_ID)

    const heroes = await dfk.heroes.getMany(ids.slice(0, 25))
    expect(heroes.length).toBeGreaterThan(0)

    const [items, tokens, profile] = await Promise.all([
      dfk.items.balances(owner),
      dfk.tokens.balances(owner),
      getContractAddress('profiles', CHAIN) ? dfk.profiles.get(owner) : undefined,
    ])
    expect(tokens.find(t => t.token.symbol === 'JEWEL')).toBeDefined()
    expect(tokens.find(t => t.token.symbol === dfk.chain.nativeCurrency.symbol)).toBeDefined()
    console.log(
      `${ids.length} heroes; items:`,
      items.slice(0, 5).map(b => `${b.item.name}=${b.formatted}`),
      'tokens:',
      tokens.map(b => `${b.token.symbol}=${b.formatted}`),
      'profile:',
      profile?.name
    )
  }, 60_000)

  it('returns null for a hero that does not exist', async () => {
    expect(await dfk.heroes.get('999999999999999')).toBeNull()
  }, 30_000)
})
