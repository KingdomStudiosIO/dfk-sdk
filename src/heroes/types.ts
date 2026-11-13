import type { AuctionListing } from '../auctions'
import type { Realm } from '../chains'
import type { Gender, HeroClass, Profession, Rarity, StatKey } from './constants'
import type { StatGenes, VisualGenes } from './genes'

export interface HeroStats extends Record<StatKey, number> {
  hp: number
  mp: number
  stamina: number
}

/** Growth chances in basis points (10000 = 100%). */
export interface HeroStatGrowth extends Record<StatKey, number> {
  hpSm: number
  hpRg: number
  hpLg: number
  mpSm: number
  mpRg: number
  mpLg: number
}

/** Equipped token ids. Visage ids are cosmetic overrides shown instead of the real item. */
export interface HeroEquipment {
  petId: string | null
  weapon1Id: string | null
  weapon1VisageId: string | null
  weapon2Id: string | null
  weapon2VisageId: string | null
  offhand1Id: string | null
  offhand1VisageId: string | null
  offhand2Id: string | null
  offhand2VisageId: string | null
  armorId: string | null
  armorVisageId: string | null
  accessoryId: string | null
  accessoryVisageId: string | null
}

export type HeroSale = AuctionListing

export interface Hero {
  /** Full on-chain id. */
  id: string
  /** The id players see in-game (realm offset removed). */
  displayId: string
  chainId: number
  originRealm: Realm
  /** Current owner. For heroes listed for sale this is the seller, not the auction contract. */
  owner?: string

  name: string
  firstName: string
  lastName: string
  gender: Gender | undefined
  class: HeroClass | undefined
  subClass: HeroClass | undefined
  profession: Profession | undefined
  element: string | undefined
  background: string | undefined
  rarity: Rarity
  shiny: boolean
  shinyStyle: number
  generation: number

  level: number
  xp: number
  xpToNextLevel: number
  stats: HeroStats
  primaryGrowth: HeroStatGrowth
  secondaryGrowth: HeroStatGrowth
  /** Gathering skills on the in-game 0-100 scale. */
  skills: Record<Profession, number>

  staminaFullAt: Date
  /** Quest contract the hero is on, or null when idle. */
  currentQuest: string | null

  summonedAt: Date
  nextSummonAt: Date
  summons: number
  maxSummons: number
  /** Gen0 heroes have unlimited summons; they report 11 like the game does. */
  summonsRemaining: number
  summonerId: string
  assistantId: string

  equipment: HeroEquipment
  statGenes: StatGenes
  visualGenes: VisualGenes
  /** Raw gene integers as decimal strings. */
  genes: { stat: string; visual: string }

  sale?: HeroSale
  /**
   * Metis only: set when the hero's genes couldn't be fetched from the indexer. Class, sub-class,
   * rarity, level, stats and gear still come from chain; gene-derived fields are empty.
   */
  incomplete?: true
}
