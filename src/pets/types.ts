import type { AuctionListing } from '../auctions'
import type { Realm } from '../chains'
import type { Profession, Rarity } from '../heroes/constants'
import type { PetBonusRarity, PetEggType, PetElement } from './constants'

/** Species art and naming for one appearance id. */
export interface PetAppearance {
  family: string
  name: string
  variant: string
  /** Index into `RARITIES`. */
  rarity: number
  pool: string
  /** Sprite sheet path relative to the pet art folder; use `getPetSpriteUrl`. */
  sprite: string
  credits?: string
}

export interface PetBonus {
  kind: 'gathering' | 'crafting' | 'combat'
  /** The bonus id as stored on chain (unpadded). */
  id: number
  /** 1-3 star tier. */
  tier: 1 | 2 | 3
  rarity: PetBonusRarity
  name: string
  /** False until the pet has been bonded to a hero and the bonus revealed. */
  revealed: boolean
  /** Raw scalar from chain. */
  scalar: number
  /** Scalar in display units (percent for most combat bonuses). */
  value: number
}

export interface Pet {
  id: string
  /** The id players see in-game (realm offset removed). */
  displayId: string
  chainId: number
  originRealm: Realm
  /** Current owner. For pets listed for sale this is the seller, not the auction contract. */
  owner?: string

  /** Custom name if the owner set one, otherwise the species name. */
  name: string
  customName: string | null
  species: PetAppearance | undefined
  season: number
  eggType: PetEggType
  /** Gathering profession the pet's egg type boosts. */
  profession: Profession
  rarity: Rarity
  element: PetElement
  background: string
  backgroundId: number
  shiny: boolean
  appearance: number

  bonusCount: number
  gathering: PetBonus | null
  crafting: PetBonus | null
  combat: PetBonus | null

  /** Hero the pet is bonded to, or null. */
  equippedTo: string | null
  rerolling: boolean
  equippableAt: Date
  /** When an equipped pet gets hungry; null if it hasn't been fed. */
  hungryAt: Date | null
  fedBy: string | null
  foodType: number | null

  sale?: AuctionListing
}
