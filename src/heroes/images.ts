import { md5 } from '@noble/hashes/legacy'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { getChain } from '../chains'
import { getAssetConfig, getHeroRigBaseUrl, type AssetConfig } from '../config'
import type { Hero, HeroEquipment } from './types'

type HeroRef = Pick<Hero, 'id' | 'chainId'> & { equipment?: Partial<HeroEquipment> }

/**
 * The hero generator caches renders by equipped gear. This reproduces the game's cache key
 * so images refresh when a hero's visible gear changes.
 */
export function getHeroRenderHash(equipment?: Partial<HeroEquipment>): string {
  const shown = (id?: string | null, visage?: string | null) => visage || id || undefined
  // Must match the game byte-for-byte, including empty slots stringifying as "undefined".
  const key = `${shown(equipment?.weapon1Id, equipment?.weapon1VisageId)}-${shown(
    equipment?.offhand1Id,
    equipment?.offhand1VisageId
  )}-${shown(equipment?.accessoryId, equipment?.accessoryVisageId)}-${shown(equipment?.armorId, equipment?.armorVisageId)}`
  return bytesToHex(md5(utf8ToBytes(key))).slice(0, 8)
}

function generatorUrl(chainId: number, assets?: Partial<AssetConfig>) {
  const cfg = getAssetConfig(assets)
  return (getChain(chainId).testnet ? cfg.heroGeneratorTestnetUrl : cfg.heroGeneratorUrl).replace(/\/$/, '')
}

/** Full-body static portrait (PNG). */
export function getHeroImageUrl(hero: HeroRef, assets?: Partial<AssetConfig>): string {
  return `${generatorUrl(hero.chainId, assets)}/image/${getHeroRenderHash(hero.equipment)}/${hero.id}`
}

/** Rig texture atlas the hero generator made for this hero's genes and gear. */
export function getHeroAtlasUrl(hero: HeroRef, assets?: Partial<AssetConfig>): string {
  return `${generatorUrl(hero.chainId, assets)}/atlas/${getHeroRenderHash(hero.equipment)}/${hero.id}.atlas`
}

/**
 * The game's hero rig as exported from its animation editor (skeleton and keyframes), for use
 * with other skeletal animation runtimes. The SDK itself plays the baked rig (`getHeroRigUrl`).
 */
export function getHeroSkeletonUrl(assets?: Partial<AssetConfig>): string {
  return `${getHeroRigBaseUrl(assets)}/skeleton.json`
}

/** The baked hero rig `HeroRenderer` plays: `rig.json`, with one file per animation beside it. */
export function getHeroRigUrl(assets?: Partial<AssetConfig>): string {
  return `${getHeroRigBaseUrl(assets)}/baked/rig.json`
}
