import { constants } from 'ethers'
import type { AuctionListing } from '../auctions'
import { RARITIES } from '../heroes/constants'
import { getOriginRealm } from '../heroes/utils'
import {
  PET_BACKGROUNDS,
  PET_BONUS_RARITIES,
  PET_CATALOG,
  PET_CRAFTING_PROFESSIONS,
  PET_EGG_PROFESSIONS,
  PET_EGG_TYPES,
  PET_ELEMENTS,
  PET_ID_OFFSETS,
  PET_REROLLING_EQUIPPED_TO,
  type PetEggType,
} from './constants'
import type { Pet, PetAppearance, PetBonus } from './types'

type IdInput = bigint | string | number | { toString(): string }

const appearances = PET_CATALOG.appearances as unknown as readonly Record<number, PetAppearance>[]
const gatheringNames = PET_CATALOG.gatheringBonusNames as unknown as Record<number, string>
const combatNames = PET_CATALOG.combatBonusNames as unknown as Record<number, string>
const combatDivisors = PET_CATALOG.combatBonusDivisors as unknown as Record<number, number>

/** Species data for an egg type and appearance id. */
export function getPetAppearance(eggType: PetEggType | number, appearance: number): PetAppearance | undefined {
  const index = typeof eggType === 'number' ? eggType : PET_EGG_TYPES.indexOf(eggType)
  return appearances[index]?.[appearance]
}

/** The short id players see in-game (realm offset removed). */
export function getDisplayPetId(petId: IdInput): string {
  const id = BigInt(petId.toString())
  if (id >= PET_ID_OFFSETS.avalanche) return (id - PET_ID_OFFSETS.avalanche).toString()
  if (id >= PET_ID_OFFSETS.serendale2) return (id - PET_ID_OFFSETS.serendale2).toString()
  if (id >= PET_ID_OFFSETS.crystalvale) return (id - PET_ID_OFFSETS.crystalvale).toString()
  return id.toString()
}

/** Star tier of a raw bonus id: 1-79 one star, 80-159 two, 160+ three. */
export function getPetBonusTier(id: number): 0 | 1 | 2 | 3 {
  if (id >= 160) return 3
  if (id >= 80) return 2
  if (id >= 1) return 1
  return 0
}

// Freshly hatched pets carry the placeholder id of their tier until the bonus is revealed.
const UNREVEALED = new Set([1, 80, 160])
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1)

function bonus(kind: PetBonus['kind'], id: number, scalar: number, name: string, divisor = 1): PetBonus | null {
  const tier = getPetBonusTier(id)
  if (tier === 0) return null
  return {
    kind,
    id,
    tier,
    rarity: PET_BONUS_RARITIES[tier],
    name,
    revealed: !UNREVEALED.has(id),
    scalar,
    value: divisor ? scalar / divisor : scalar,
  }
}

const n = (v: { toString(): string } | number) => Number(v.toString())
const dateOrNull = (v: { toString(): string }) => (n(v) > 0 ? new Date(n(v) * 1000) : null)

/**
 * Converts a PetCoreDiamond `getPetV2` struct (as decoded by ethers) into a `Pet`. Exposed so
 * apps that fetch pets themselves get the same shape as the SDK's fetchers.
 */
export function parsePetV2(raw: any, chainId: number, extras: { owner?: string; sale?: AuctionListing } = {}): Pet {
  const id = raw.id.toString()
  const eggTypeId = n(raw.eggType)
  const eggType = PET_EGG_TYPES[eggTypeId] ?? 'blue'
  const element = PET_ELEMENTS[n(raw.element)] ?? 'fire'
  const appearance = n(raw.appearance)
  const species = getPetAppearance(eggTypeId, appearance)
  const backgroundId = n(raw.background)
  const equippedTo = raw.equippedTo.isZero() ? null : raw.equippedTo.toString()
  const profBonus = n(raw.profBonus)
  const craftBonus = n(raw.craftBonus)
  const combatBonus = n(raw.combatBonus)
  const customName: string = raw.name

  return {
    id,
    displayId: getDisplayPetId(id),
    chainId,
    originRealm: getOriginRealm(id),
    owner: extras.owner,
    name: customName || species?.name || `Pet #${getDisplayPetId(id)}`,
    customName: customName || null,
    species,
    season: n(raw.season),
    eggType,
    profession: PET_EGG_PROFESSIONS[eggType],
    rarity: RARITIES[n(raw.rarity)] ?? 'common',
    element,
    background: PET_BACKGROUNDS[backgroundId] ?? 'Unknown',
    backgroundId,
    shiny: n(raw.shiny) > 0,
    appearance,
    bonusCount: n(raw.bonusCount),
    // Gathering bonus names are keyed by egg type, padded by 10000 per type.
    gathering: bonus('gathering', profBonus, n(raw.profBonusScalar), gatheringNames[eggTypeId * 10000 + profBonus] ?? 'Unknown'),
    crafting: bonus('crafting', craftBonus, n(raw.craftBonusScalar), `${capitalize(PET_CRAFTING_PROFESSIONS[element])} bonus`),
    combat: bonus(
      'combat',
      combatBonus,
      n(raw.combatBonusScalar),
      combatNames[combatBonus] ?? 'Unknown',
      combatDivisors[combatBonus]
    ),
    equippedTo: equippedTo === PET_REROLLING_EQUIPPED_TO ? null : equippedTo,
    rerolling: equippedTo === PET_REROLLING_EQUIPPED_TO,
    equippableAt: new Date(n(raw.equippableAt) * 1000),
    hungryAt: dateOrNull(raw.hungryAt),
    fedBy: raw.fedBy && raw.fedBy !== constants.AddressZero ? raw.fedBy : null,
    foodType: raw.foodType === undefined ? null : n(raw.foodType),
    ...(extras.sale ? { sale: extras.sale } : {}),
  }
}

/** An equipped pet whose hunger timer has run out stops granting its bonuses. */
export function isPetHungry(pet: Pick<Pet, 'equippedTo' | 'hungryAt'>, now: Date = new Date()): boolean {
  return pet.equippedTo !== null && pet.hungryAt !== null && pet.hungryAt.getTime() < now.getTime()
}
