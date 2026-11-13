import { ChainId, type Realm } from '../chains'
import { femaleFirstNames, lastNames, maleFirstNames } from '../generated/names'
import { REALM_ID_OFFSETS, type Gender } from './constants'

type IdInput = bigint | string | number | { toString(): string }

/** The realm a hero was originally summoned in, from its id range. */
export function getOriginRealm(heroId: IdInput): Realm {
  const id = BigInt(heroId.toString())
  if (id > REALM_ID_OFFSETS.avalanche) return 'avalanche'
  if (id > REALM_ID_OFFSETS.serendale2) return 'serendale2'
  if (id > REALM_ID_OFFSETS.crystalvale) return 'crystalvale'
  if (id > REALM_ID_OFFSETS.sunderedisles) return 'sunderedisles'
  return 'serendale'
}

/** The short id players see in-game (the realm offset removed). */
export function getDisplayHeroId(heroId: IdInput): string {
  const id = BigInt(heroId.toString())
  for (const offset of [
    REALM_ID_OFFSETS.avalanche,
    REALM_ID_OFFSETS.serendale2,
    REALM_ID_OFFSETS.crystalvale,
    REALM_ID_OFFSETS.sunderedisles,
  ]) {
    if (id >= offset) return (id - offset).toString()
  }
  return id.toString()
}

export function getHeroFirstName(gender: Gender | undefined, index: number): string {
  if (gender === 'male') return maleFirstNames[index] ?? ''
  if (gender === 'female') return femaleFirstNames[index] ?? ''
  return ''
}

export function getHeroLastName(index: number): string {
  return lastNames[index] ?? ''
}

/** XP needed to finish the current level. */
export function xpToNextLevel(level: number): number {
  const next = level + 1
  if (level < 6) return next * 1000
  if (level < 9) return 4000 + (next - 5) * 2000
  if (level < 16) return 12000 + (next - 9) * 4000
  if (level < 36) return 40000 + (next - 16) * 5000
  if (level < 56) return 140000 + (next - 36) * 7500
  return 290000 + (next - 56) * 10000
}

/**
 * Seconds to regenerate one stamina point. Heroes regen faster as they level;
 * the Rapid Renewal power-up raises the per-level bonus from 2s to 5s.
 */
export function getStaminaRechargeSeconds(
  level: number,
  chainId: number,
  { rapidRenewal = false }: { rapidRenewal?: boolean } = {}
): number {
  const base = chainId === ChainId.DFK_TESTNET || chainId === ChainId.KAIA_TESTNET ? 100 : 1200
  return base - (rapidRenewal ? 5 : 2) * (level - 1)
}

/**
 * Current stamina, derived from when the hero's stamina will be full again.
 * Matches the game: can dip to -5 when a quest overdraws stamina.
 */
export function getCurrentStamina(
  hero: { level: number; chainId: number; stats: { stamina: number }; staminaFullAt: Date },
  { now = new Date(), rapidRenewal = false }: { now?: Date; rapidRenewal?: boolean } = {}
): number {
  const remainingSeconds = (hero.staminaFullAt.getTime() - now.getTime()) / 1000
  if (remainingSeconds <= 0) return hero.stats.stamina
  const rate = getStaminaRechargeSeconds(hero.level, hero.chainId, { rapidRenewal })
  return Math.max(hero.stats.stamina - Math.ceil(remainingSeconds / rate), -5)
}
