import { BigNumber, Wallet, constants } from 'ethers'
import { describe, expect, it } from 'vitest'
import {
  ChainId,
  PET_CATALOG,
  auctionIface,
  createDFKWriter,
  describeEquipmentBonus,
  getAuctionPrice,
  getDisplayPetId,
  getEquipmentImageUrl,
  getEquipmentName,
  getPetAppearance,
  getPetBonusTier,
  getPetCardArt,
  getPetSpriteUrl,
  isPetHungry,
  parseEquipment,
  parseMarketLog,
  parseMetisHero,
  parsePetV2,
} from '../src'

const bn = (v: number | string) => BigNumber.from(v)

function rawPet(overrides: Record<string, unknown> = {}) {
  return {
    id: bn('2000000000042'),
    originId: 0,
    name: '',
    season: 1,
    eggType: 2,
    rarity: 3,
    element: 7,
    bonusCount: 3,
    profBonus: 171,
    profBonusScalar: 40,
    craftBonus: 80,
    craftBonusScalar: 20,
    combatBonus: 2,
    combatBonusScalar: 50,
    appearance: 1,
    background: 9,
    shiny: 1,
    hungryAt: bn(1_700_000_000),
    equippableAt: bn(0),
    equippedTo: bn('2000000000001'),
    fedBy: constants.AddressZero,
    foodType: 1,
    ...overrides,
  }
}

describe('pets', () => {
  it('ships appearances for every egg type', () => {
    expect(PET_CATALOG.appearances).toHaveLength(3)
    const blub = getPetAppearance('blue', 1)!
    expect(blub).toMatchObject({ family: 'Blubs', name: 'Blub', variant: 'Blue' })
    expect(getPetSpriteUrl(blub)).toBe('https://defi-kingdoms.b-cdn.net/art-assets/pets2/Sheets/Blubs/Blub_Blue_Idle.png')
  })

  it('decodes a pet struct with all three bonuses', () => {
    const pet = parsePetV2(rawPet(), ChainId.KAIA_MAINNET, { owner: '0xabc' })
    expect(pet).toMatchObject({
      displayId: '42',
      originRealm: 'serendale2',
      eggType: 'green',
      profession: 'gardening',
      rarity: 'legendary',
      element: 'dark',
      background: 'Inner Grove',
      shiny: true,
      equippedTo: '2000000000001',
      rerolling: false,
    })
    expect(pet.name).toBe(pet.species!.name)
    // Green egg, 171 = three-star Innate Greenskeeper.
    expect(pet.gathering).toMatchObject({ tier: 3, rarity: 'mythic', name: 'Innate Greenskeeper', revealed: true })
    // 80 is the unrevealed two-star placeholder.
    expect(pet.crafting).toMatchObject({ tier: 2, rarity: 'rare', name: 'Alchemy bonus', revealed: false })
    expect(pet.combat).toMatchObject({ tier: 1, name: 'Stone Hide', revealed: true })
  })

  it('handles custom names, missing bonuses and rerolls', () => {
    const pet = parsePetV2(
      rawPet({ name: 'Sir Hops', craftBonus: 0, combatBonus: 0, equippedTo: bn('9999999999999') }),
      ChainId.DFK_MAINNET
    )
    expect(pet.name).toBe('Sir Hops')
    expect(pet.customName).toBe('Sir Hops')
    expect(pet.crafting).toBeNull()
    expect(pet.combat).toBeNull()
    expect(pet.rerolling).toBe(true)
    expect(pet.equippedTo).toBeNull()
  })

  it('knows bonus tiers, ids and hunger', () => {
    expect([0, 1, 79, 80, 159, 160, 171].map(getPetBonusTier)).toEqual([0, 1, 1, 2, 2, 3, 3])
    expect(getDisplayPetId('1000000000123')).toBe('123')
    const pet = parsePetV2(rawPet(), ChainId.DFK_MAINNET)
    expect(isPetHungry(pet, new Date(1_800_000_000_000))).toBe(true)
    expect(isPetHungry(pet, new Date(1_600_000_000_000))).toBe(false)
    expect(isPetHungry({ ...pet, equippedTo: null }, new Date(1_800_000_000_000))).toBe(false)
  })

  it('builds card art URLs', () => {
    const art = getPetCardArt({ rarity: 'mythic', backgroundId: 4, element: 'ice' }, { artBaseUrl: 'https://art.test' })
    expect(art.front).toBe('https://art.test/pets/cards/mythic_front.png')
    expect(art.sceneBackground).toBe('https://art.test/pets/backgrounds/lavabg.png')
    expect(art.elementIcon).toBe('https://art.test/pets/elements/ice_icon.png')
  })
})

function rawWeapon() {
  return {
    id: bn('1000000000555'),
    displayInfoMagicAttack: {
      weaponType: 11, // 1H Sword
      displayId: 2,
      rarity: 2,
      craftedBy: bn(0),
      dye1: 1,
      dye2: 2,
      basePotency: 0,
      focusRequirement: 0,
      mAccuracyAtRequirement: 0,
      mScalarStat1: 0,
      mScalarStat2: 0,
      mScalarStat3: 0,
      mScalarValue1: 0,
      mScalarValue2: 0,
      mScalarValue3: 0,
      mScalarMax1: 0,
      mScalarMax2: 0,
      mScalarMax3: 0,
      restorationCount: 1,
    },
    stateEnchantments: {
      equippedTo: bn(0),
      equippableAt: bn(0),
      maxDurability: 100,
      durability: 80,
      maxRepairs: 3,
      remainingRepairs: 2,
      equipRequirement: 5,
      enchantmentType1: 0,
      enchantmentType2: 0,
      enchantmentType3: 0,
      enchantmentScalar1: 0,
      enchantmentScalar2: 0,
      enchantmentScalar3: 0,
    },
    bonusInfoPhysicalAttack: {
      bonus1: 2, // Bleed, scalar / 10 percent
      bonus2: 22, // Critical hit multiplier, scalar / 100
      bonus3: 0,
      bonus4: 0,
      bonusScalar1: 55,
      bonusScalar2: 25,
      bonusScalar3: 0,
      bonusScalar4: 0,
      baseDamage: 12,
      accuracyRequirement: 10,
      pAccuracyAtRequirement: 90,
      pScalarStat1: 1,
      pScalarStat2: 2,
      pScalarStat3: 0,
      pScalarValue1: 30,
      pScalarValue2: 10,
      pScalarValue3: 0,
      pScalarMax1: 200,
      pScalarMax2: 100,
      pScalarMax3: 0,
      uniqueSettings: 0,
      speedModifier: 0,
    },
  }
}

describe('equipment', () => {
  it('decodes a weapon with names, stats and bonus text', () => {
    const w = parseEquipment(rawWeapon(), 'weapon', ChainId.DFK_MAINNET, { owner: '0xabc' })
    expect(w).toMatchObject({
      kind: 'weapon',
      typeName: '1H Sword',
      name: getEquipmentName('weapon', 11, 2),
      rarity: 'rare',
      durability: 80,
      equippedTo: null,
      originRealm: 'crystalvale',
    })
    expect(w.name).not.toMatch(/Unknown/)
    expect(w.bonuses.map(b => b.text)).toEqual([
      'Gain 5.5% chance to inflict Bleed on hit',
      'Increase Critical Hit damage multiplier by +0.25',
    ])
    expect(w.weapon!.physicalScaling).toEqual([
      { stat: 'STR', value: 30, max: 200 },
      { stat: 'DEX', value: 10, max: 100 },
    ])
    expect(w.image).toBe(getEquipmentImageUrl('weapon', 11, 2))
  })

  it('splits accessory-contract items into accessories and offhands', () => {
    const base = rawWeapon()
    const accessory = (equipmentType: number) => ({
      id: bn(7),
      stateEnchantments: base.stateEnchantments,
      displayBonusInfo: {
        equipmentType,
        displayId: 1,
        rarity: 0,
        craftedBy: bn(0),
        dye1: 0,
        dye2: 0,
        restorationCount: 0,
        uniqueSettings: 0,
        bonus1: 0,
        bonus2: 0,
        bonus3: 0,
        bonus4: 0,
        bonus5: 0,
        bonusScalar1: 0,
        bonusScalar2: 0,
        bonusScalar3: 0,
        bonusScalar4: 0,
        bonusScalar5: 0,
      },
    })
    expect(parseEquipment(accessory(1), 'accessory', 1).kind).toBe('accessory')
    const shield = parseEquipment(accessory(2), 'accessory', 1)
    expect(shield.kind).toBe('offhand')
    expect(shield.typeName).toBe('Shield')
    expect(shield.image).toMatch(/\/equipment\/accessory\/2-1\.png$/)
  })

  it('fills range bonuses packed into one scalar', () => {
    // Bonus 231 (duel roll) packs its bounds as low byte + high byte.
    expect(describeEquipmentBonus('accessory', 231, 5 * 256 + 2).text).toBe('Gain a roll for +2-5 added to Duel Score when Dueling')
  })
})

describe('auctions and market logs', () => {
  const listing = {
    seller: '0x1',
    startingPrice: 100n,
    endingPrice: 50n,
    startedAt: new Date(0),
    durationSeconds: 100,
  }

  it('interpolates clock auction prices', () => {
    expect(getAuctionPrice(listing, new Date(0))).toBe(100n)
    expect(getAuctionPrice(listing, new Date(50_000))).toBe(75n)
    expect(getAuctionPrice(listing, new Date(1_000_000))).toBe(50n)
  })

  it('decodes auction events', () => {
    const seller = Wallet.createRandom().address
    const created = auctionIface.encodeEventLog(auctionIface.getEvent('AuctionCreated'), [7, seller, 42, 10n ** 18n, 10n ** 18n, 60, constants.AddressZero])
    const log = { ...created, blockNumber: 5, transactionHash: '0xaa', logIndex: 0 } as any
    expect(parseMarketLog('heroes', log)).toMatchObject({
      type: 'listed',
      tokenId: '42',
      auctionId: '7',
      seller,
      startingPrice: 10n ** 18n,
      durationSeconds: 60,
    })
    const sold = auctionIface.encodeEventLog(auctionIface.getEvent('AuctionSuccessful'), [7, 42, 5n, seller])
    expect(parseMarketLog('pets', { ...sold, blockNumber: 6, transactionHash: '0xbb', logIndex: 1 } as any)).toMatchObject({
      type: 'sold',
      market: 'pets',
      price: 5n,
      buyer: seller,
    })
  })
})

describe('Metis heroes', () => {
  const zeros = new Proxy({}, { get: (_t, k) => (k === 'id' ? bn('1000000010863') : k === 'class' ? bn(1) : k === 'level' ? bn(7) : bn(0)) })

  it('joins chain state with indexer genes', () => {
    const hero = parseMetisHero(zeros, ChainId.METIS_MAINNET, {
      genes: {
        stat: '163561870968949171930950646561416709015778641279499355071026953263238',
        visual: '167423376903559258079566151037135525897970617874572331469591208506097764',
      },
    })
    expect(hero).toMatchObject({ class: 'knight', level: 7, displayId: '10863', originRealm: 'crystalvale' })
    expect(hero.gender).toBeDefined()
    expect(hero.incomplete).toBeUndefined()
  })

  it('marks heroes without genes as incomplete', () => {
    const hero = parseMetisHero(zeros, ChainId.METIS_MAINNET)
    expect(hero.incomplete).toBe(true)
    expect(hero.gender).toBeUndefined()
    expect(hero.class).toBe('knight')
  })
})

describe('writer', () => {
  const writer = createDFKWriter(Wallet.createRandom(), ChainId.DFK_MAINNET)

  it('validates quest options before sending', () => {
    expect(() => writer.quests.start({ heroIds: [1], quest: 'training' })).toThrow(/stat/)
    expect(() => writer.quests.start({ heroIds: [1], quest: 'gardening' })).toThrow(/gardenPoolId/)
  })

  it('refuses chains without the contract', () => {
    const avax = createDFKWriter(Wallet.createRandom(), ChainId.AVALANCHE_MAINNET)
    expect(() => avax.quests.complete(1)).toThrow(/questCore is not deployed/)
  })
})
