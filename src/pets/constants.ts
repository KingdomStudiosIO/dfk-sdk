import { PET_CATALOG } from '../generated/pets'
import type { Profession } from '../heroes/constants'

export { PET_CATALOG }

/** Egg types by id. Each hatches pets with a bonus for one gathering profession. */
export const PET_EGG_TYPES = ['blue', 'grey', 'green'] as const
export type PetEggType = (typeof PET_EGG_TYPES)[number]

export const PET_EGG_PROFESSIONS: Record<PetEggType, Profession> = {
  blue: 'fishing',
  grey: 'foraging',
  green: 'gardening',
}

export const PET_ELEMENTS = ['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'light', 'dark'] as const
export type PetElement = (typeof PET_ELEMENTS)[number]

/** The crafting profession a pet's crafting bonus applies to, by element. */
export const PET_CRAFTING_PROFESSIONS: Record<PetElement, string> = {
  fire: 'blacksmithing',
  water: 'goldsmithing',
  earth: 'armorsmithing',
  wind: 'woodworking',
  lightning: 'leatherworking',
  ice: 'tailoring',
  light: 'enchanting',
  dark: 'alchemy',
}

export const PET_BACKGROUNDS = [
  'Stillwood Meadow',
  'Forest Trail',
  'Swamp of Eoxis',
  'Vithraven Outskirts',
  'Path of Fire',
  'Reyalin Mountain Pass',
  'Adelyn Side Street',
  'Bloater Falls',
  'Haywood Farmstead',
  'Inner Grove',
  'Vuhlmira Ruins',
] as const

/** Art keys for each background, used in the card scenery file names. */
export const PET_BACKGROUND_ART = [
  'plains',
  'forest',
  'swamp',
  'ice',
  'lava',
  'cliff',
  'town',
  'waterfall',
  'farm',
  'grove',
  'skycastle',
] as const

/** Bonus tiers as the game labels them. */
export const PET_BONUS_RARITIES = { 1: 'common', 2: 'rare', 3: 'mythic' } as const
export type PetBonusRarity = (typeof PET_BONUS_RARITIES)[keyof typeof PET_BONUS_RARITIES]

export const PET_ID_OFFSETS = {
  crystalvale: 1_000_000_000_000n,
  serendale2: 2_000_000_000_000n,
  avalanche: 3_000_000_000_000n,
} as const

/** `equippedTo` value the game writes while a pet is being rerolled. */
export const PET_REROLLING_EQUIPPED_TO = '9999999999999'

/** Pet sprite sheets are rows of 72px-wide frames, played at 10 fps. */
export const PET_SPRITE_FRAME_WIDTH = 72
export const PET_SCENE_FRAME_SIZE = 90
export const PET_FPS = 10
