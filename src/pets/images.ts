import { getArtUrl, type AssetConfig } from '../config'
import { PET_BACKGROUND_ART, PET_ELEMENTS, type PetElement } from './constants'
import type { Pet, PetAppearance } from './types'

const CARD_RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythic'] as const

/**
 * Horizontal sprite sheet of the pet's idle animation: frames are 72px wide
 * (`PET_SPRITE_FRAME_WIDTH`), and the sheet may be taller than 72px for big pets.
 */
export function getPetSpriteUrl(
  pet: Pick<Pet, 'species'> | PetAppearance,
  assets?: Partial<AssetConfig>
): string | undefined {
  const sprite = 'sprite' in pet ? pet.sprite : pet.species?.sprite
  // Some catalog paths are already URL-encoded; normalize before encoding.
  return sprite ? getArtUrl(`pets2/Sheets/${encodeURI(decodeURI(sprite))}`, assets) : undefined
}

export interface PetCardArt {
  front: string
  back: string
  /** Alpha mask of the card shape, used for the shiny foil effect. */
  mask: string
  /** Animated gem sprite strip for the card's rarity. */
  gem: string
  /** Scenery behind and in front of the pet: strips of 90px frames. */
  sceneBackground: string
  sceneForeground: string
  elementIcon: string
}

/** The layered art the game composes into a pet card. */
export function getPetCardArt(
  pet: Pick<Pet, 'rarity' | 'backgroundId' | 'element'>,
  assets?: Partial<AssetConfig>
): PetCardArt {
  const rarity = CARD_RARITIES.includes(pet.rarity) ? pet.rarity : 'common'
  const scene = PET_BACKGROUND_ART[pet.backgroundId] ?? PET_BACKGROUND_ART[0]
  return {
    front: getArtUrl(`pets/cards/${rarity}_front.png`, assets),
    back: getArtUrl(`pets/cards/${rarity}_back.png`, assets),
    mask: getArtUrl(`pets/cards/mask_${rarity}.png`, assets),
    gem: getArtUrl(`pets/cards/gem_${rarity}.png`, assets),
    sceneBackground: getArtUrl(`pets/backgrounds/${scene}bg.png`, assets),
    sceneForeground: getArtUrl(`pets/backgrounds/${scene}fg.png`, assets),
    elementIcon: getPetElementIconUrl(pet.element, assets),
  }
}

export function getPetElementIconUrl(element: PetElement, assets?: Partial<AssetConfig>): string {
  return getArtUrl(`pets/elements/${PET_ELEMENTS.includes(element) ? element : 'fire'}_icon.png`, assets)
}
