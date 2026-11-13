/**
 * The hero generator's art rules as data (src/generated/hero-generator.ts, recorded from the
 * generator's own code by scripts/sync-hero-generator.mjs).
 */

/**
 * An image: a file under `assets/hero-generator/`, a placeholder for one of the hero's own cells
 * (`@class/Body`, `@hairFront`, `@head/standard`, ...), or another image changed by `sharp`-style
 * steps in order: crop (`extract`), pad to a size (`resize`, contain, top left), paste (`composite`).
 * Paths may hold `{skin}`, `{d1}` and `{d2}`: the hero's skin color and the item's dyes.
 */
export type GeneratorImage =
  | string
  | {
      base: GeneratorImage
      ops: GeneratorOp[]
    }

export type GeneratorOp =
  | { extract: { left: number; top: number; width: number; height: number } }
  | { resize: { width: number; height: number } }
  /** No `top`/`left`: centered, as sharp places it. */
  | { composite: { input: GeneratorImage; top?: number; left?: number }[] }

/** What an armor replaces, keyed by the generator's own names (`editedArmorBody`, ...). */
export type GeneratorArmorLook = Record<string, GeneratorImage>

export interface GeneratorAccessoryLook {
  /** `combinedHair`, `combinedMask`, `combinedHeadPaths`, `editedHairBack`, ... */
  head?: Record<string, GeneratorImage | Record<string, GeneratorImage>>
  /** The body with the accessory over it (`combinedBody`). */
  body?: GeneratorImage
  /** `combinedLeftArm`. */
  arm?: Record<string, GeneratorImage>
  /** `combinedLegsBody`, `editedLeftLegTopPath`, ... */
  legs?: Record<string, GeneratorImage>
  /** Dyes used when the item has none. */
  dyes?: [number, number]
}

export interface GeneratorWeapons {
  mainWeapon: string
  offhandWeapon: string
  bowWeapon: string
}

export interface GeneratorArt {
  /** The hero generator commit this was recorded from. */
  commit: string
  /** The atlas regions (`.atlas` text); `{page}` is the page image's name. */
  atlas: string
  /** gender -> `${armorType}-${displayId}` (or `*-${displayId}`: any armor type) -> look. */
  armor: Record<string, Record<string, GeneratorArmorLook>>
  /** gender -> accessory displayId -> look. */
  accessories: Record<string, Record<string, GeneratorAccessoryLook>>
  weapons: {
    /** Each class's own weapon, shield and bow. */
    classes: Record<string, GeneratorWeapons>
    /** weaponType -> displayId (or `*`: any) -> the slots that weapon sets. */
    weapon: Record<string, Record<string, Partial<GeneratorWeapons>>>
    /** Shield displayId -> the slots it sets. */
    offhand: Record<string, Partial<GeneratorWeapons>>
  }
}
