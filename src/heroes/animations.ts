import type { Equipment } from '../equipment/types'
import { RIG_EQUIPMENT } from '../generated/rig-equipment'
import type { HeroClass, Profession } from './constants'

/** Weapon animation sets available in the hero rig. */
export type WeaponAnimationSet =
  | '1H Dagger'
  | '1H Mace'
  | '1H Shortsword'
  | '1H Spear'
  | '1H Sword'
  | '1H Wand'
  | '2H Axe'
  | '2H Spear'
  | '2H Staff'
  | '2H Sword'
  | 'Bow'
  | 'Gloves'

export type WeaponAnimationAction =
  | 'Casual'
  | 'Idle'
  | 'Celebrate'
  | 'Hit'
  | 'MoveForward'
  | 'MoveBackward'

/** Weapon a class holds when nothing is equipped, matching the game client. */
export const CLASS_DEFAULT_WEAPON: Record<HeroClass, WeaponAnimationSet> = {
  // The game renders warriors with the knight's sword.
  warrior: '1H Sword',
  knight: '1H Sword',
  thief: '1H Dagger',
  archer: 'Bow',
  priest: '2H Staff',
  wizard: '1H Wand',
  monk: 'Gloves',
  pirate: '1H Sword',
  berserker: '2H Axe',
  seer: '1H Wand',
  legionnaire: '1H Spear',
  scholar: '1H Wand',
  paladin: '1H Sword',
  darkKnight: '2H Sword',
  summoner: '1H Wand',
  ninja: '1H Dagger',
  shapeshifter: 'Gloves',
  bard: '1H Sword',
  dragoon: '2H Spear',
  sage: '1H Wand',
  spellBow: 'Bow',
  dreadKnight: '2H Sword',
}

/** Common animation names in the hero rig. Any name from `HeroRenderer.animations` also works. */
export const HERO_ANIMATIONS = {
  overworldIdle: 'GENERIC/Overworld-Idle',
  overworldWalk: 'GENERIC/Overworld-Walk',
  overworldTalk: 'GENERIC/Overworld-Talk',
  walk: 'GENERIC/Walk',
  hurt: 'GENERIC/Hurt',
  down: 'GENERIC/Down',
  getUp: 'GENERIC/GetUp',
  shout: 'GENERIC/Shout',
  useItem: 'GENERIC/UseItem',
  spectator: 'GENERIC/Spectator',
  training: 'TRADE/Training',
} as const

export function weaponAnimation(weapon: WeaponAnimationSet, action: WeaponAnimationAction = 'Casual'): string {
  return `WEAPONS/${weapon}/${weapon} ${action}`
}

export function professionAnimation(profession: Profession): string {
  return `TRADE/${profession[0].toUpperCase()}${profession.slice(1)}`
}

const ANIMATION_SETS = new Set<string>([
  '1H Dagger', '1H Mace', '1H Shortsword', '1H Spear', '1H Sword', '1H Wand',
  '2H Axe', '2H Spear', '2H Staff', '2H Sword', 'Bow', 'Gloves',
] satisfies WeaponAnimationSet[])

/**
 * The weapon animation set a hero plays: its equipped weapon's type, as in combat, or its class's
 * default weapon when nothing is equipped (or the rig has no animations for that weapon type,
 * like 1H axes and 2H maces).
 */
export function getHeroWeaponAnimationSet(
  hero: { class?: HeroClass },
  gear?: { weapon1?: Pick<Equipment, 'typeId'> | null } | null
): WeaponAnimationSet {
  const set = gear?.weapon1 ? RIG_EQUIPMENT.animationSets[gear.weapon1.typeId] : undefined
  if (set && ANIMATION_SETS.has(set)) return set as WeaponAnimationSet
  return hero.class ? CLASS_DEFAULT_WEAPON[hero.class] : '1H Sword'
}

/** The idle animation for a hero: its weapon's (or class's) casual stance, as on its card. */
export function getDefaultHeroAnimation(hero: { class?: HeroClass }, gear?: { weapon1?: Pick<Equipment, 'typeId'> | null } | null): string {
  return weaponAnimation(getHeroWeaponAnimationSet(hero, gear), 'Casual')
}
