import type { AuctionListing } from '../auctions'
import type { Realm } from '../chains'

/** Offhands (shields, foci) live on the accessory contract but are their own kind in game. */
export type EquipmentKind = 'weapon' | 'armor' | 'accessory' | 'offhand'

/** The contract an equipment kind lives on. */
export type EquipmentContractKind = 'weapon' | 'armor' | 'accessory'

export interface EquipmentBonus {
  id: number
  scalar: number
  /** `scalar` in display units. */
  value: number
  /** The game's tooltip text with the value filled in. */
  text: string
}

export interface StatScaling {
  /** Stat abbreviation, e.g. `STR`. */
  stat: string
  value: number
  max: number
}

export interface WeaponStats {
  baseDamage: number
  basePotency: number
  speedModifier: number
  accuracyRequirement: number
  focusRequirement: number
  physicalAccuracyAtRequirement: number
  magicalAccuracyAtRequirement: number
  physicalScaling: StatScaling[]
  magicalScaling: StatScaling[]
}

export interface ArmorStats {
  physicalDefense: number
  magicalDefense: number
  physicalDefenseScalar: number
  magicalDefenseScalar: number
  physicalDefenseScalarMax: number
  magicalDefenseScalarMax: number
  evasion: number
}

export interface Equipment {
  id: string
  kind: EquipmentKind
  chainId: number
  originRealm: Realm
  owner?: string

  name: string
  lore: string | undefined
  /** Weapon type, armor type or accessory type id. */
  typeId: number
  /** e.g. `1H Sword`, `Heavy Armor`, `Shield`. */
  typeName: string
  displayId: number
  rarity: string
  rarityId: number
  craftedBy: string
  /** Icon URL on the game's art CDN. */
  image: string
  dyes: [number, number]

  durability: number
  maxDurability: number
  remainingRepairs: number
  maxRepairs: number
  restorationCount: number
  /** Hero level needed to equip. */
  equipRequirement: number
  equippedTo: string | null
  equippableAt: Date

  bonuses: EquipmentBonus[]
  enchantments: EquipmentBonus[]
  weapon?: WeaponStats
  armor?: ArmorStats

  sale?: AuctionListing
}

/** A hero's resolved gear. Visages are cosmetic items shown instead of the real one. */
export interface HeroGear {
  weapon1: Equipment | null
  weapon1Visage: Equipment | null
  weapon2: Equipment | null
  weapon2Visage: Equipment | null
  offhand1: Equipment | null
  offhand1Visage: Equipment | null
  offhand2: Equipment | null
  offhand2Visage: Equipment | null
  armor: Equipment | null
  armorVisage: Equipment | null
  accessory: Equipment | null
  accessoryVisage: Equipment | null
}
