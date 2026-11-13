import { describe, expect, it } from 'vitest'
import {
  ChainId,
  ITEM_CATALOG,
  formatAmount,
  getCurrentStamina,
  getDisplayHeroId,
  getHeroImageUrl,
  getHeroRenderHash,
  getItem,
  getItemByAddress,
  getItemImageUrl,
  getItems,
  getOriginRealm,
  getPowerToken,
  getTokens,
  parseAmount,
  xpToNextLevel,
} from '../src'

describe('hero ids', () => {
  it('maps id ranges to realms', () => {
    expect(getOriginRealm('1')).toBe('serendale')
    expect(getOriginRealm('500000000001')).toBe('sunderedisles')
    expect(getOriginRealm('1000000000001')).toBe('crystalvale')
    expect(getOriginRealm(2000000000001n)).toBe('serendale2')
    expect(getOriginRealm('3000000000001')).toBe('avalanche')
  })

  it('strips realm offsets for display', () => {
    expect(getDisplayHeroId('1000000123456')).toBe('123456')
    expect(getDisplayHeroId('3000000000042')).toBe('42')
    expect(getDisplayHeroId('42')).toBe('42')
  })
})

describe('leveling and stamina', () => {
  it('matches the game XP curve', () => {
    expect(xpToNextLevel(1)).toBe(2000)
    expect(xpToNextLevel(5)).toBe(6000)
    expect(xpToNextLevel(8)).toBe(12000)
    expect(xpToNextLevel(15)).toBe(40000)
    expect(xpToNextLevel(20)).toBe(65000)
  })

  it('regenerates stamina over time', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const hero = { level: 1, chainId: ChainId.DFK_MAINNET, stats: { stamina: 25 }, staminaFullAt: new Date(now.getTime() + 1200 * 5 * 1000) }
    expect(getCurrentStamina(hero, { now })).toBe(20)
    expect(getCurrentStamina({ ...hero, staminaFullAt: new Date(0) }, { now })).toBe(25)
  })
})

describe('hero images', () => {
  it('hashes an unequipped hero like the game', () => {
    // md5("undefined-undefined-undefined-undefined")
    expect(getHeroRenderHash({})).toBe('fb05a406')
  })

  it('prefers visage ids over equipped ids', () => {
    expect(getHeroRenderHash({ weapon1Id: '5', weapon1VisageId: '9' })).toBe(getHeroRenderHash({ weapon1Id: '9' }))
  })

  it('uses the testnet generator on testnets', () => {
    expect(getHeroImageUrl({ id: '1', chainId: ChainId.DFK_TESTNET })).toMatch(/^https:\/\/testnet\.heroes\./)
    expect(getHeroImageUrl({ id: '1', chainId: ChainId.DFK_MAINNET }, { heroGeneratorUrl: 'https://x.test' })).toBe(
      'https://x.test/image/fb05a406/1'
    )
  })
})

describe('items', () => {
  it('ships a catalog with addresses', () => {
    expect(ITEM_CATALOG.length).toBeGreaterThan(150)
    const potion = getItem('healthPotion')!
    expect(potion.name).toBe('Health Vial')
    expect(getItemByAddress(ChainId.DFK_MAINNET, potion.addresses[ChainId.DFK_MAINNET].toLowerCase())?.key).toBe('healthPotion')
  })

  it('filters by chain and hides bookkeeping items', () => {
    const dfk = getItems(ChainId.DFK_MAINNET)
    expect(dfk.every(i => i.addresses[ChainId.DFK_MAINNET])).toBe(true)
    expect(dfk.some(i => i.type === 'hidden' || i.type === 'balance')).toBe(false)
    expect(getItems(ChainId.DFK_MAINNET, { includeCurrencies: true }).some(i => i.key === 'crystal')).toBe(true)
  })

  it('resolves bundled images against the asset base', () => {
    const page = ITEM_CATALOG.find(i => i.image.startsWith('asset:'))!
    expect(getItemImageUrl(page, { assetsBaseUrl: 'https://cdn.test/assets/' })).toMatch(/^https:\/\/cdn\.test\/assets\/items\/.+\.png$/)
  })
})

describe('tokens', () => {
  it('knows each realm’s power token', () => {
    expect(getPowerToken(ChainId.DFK_MAINNET)?.symbol).toBe('CRYSTAL')
    expect(getPowerToken(ChainId.KAIA_MAINNET)?.symbol).toBe('JADE')
    expect(getTokens(ChainId.DFK_MAINNET).find(t => t.symbol === 'JEWEL')?.addresses[ChainId.DFK_MAINNET]).toBe('native')
    const gold = getTokens(ChainId.DFK_MAINNET).find(t => t.symbol === 'GOLD')!
    expect(gold.decimals).toBe(3)
    expect(gold.addresses[ChainId.DFK_MAINNET]).toBe('0x576C260513204392F0eC0bc865450872025CB1cA')
  })
})

describe('format', () => {
  it('formats and parses amounts', () => {
    expect(formatAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5')
    expect(formatAmount(12345n, 3)).toBe('12.345')
    expect(formatAmount(7n, 0)).toBe('7')
    expect(parseAmount('1.5', 18)).toBe(1_500_000_000_000_000_000n)
    expect(() => parseAmount('1.2345', 3)).toThrow()
  })
})
