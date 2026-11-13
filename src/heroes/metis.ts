import type { ChainContext } from '../context'
import { HERO_CLASSES, RARITIES } from './constants'
import { decodeStatGenes, decodeVisualGenes } from './genes'
import type { Hero, HeroEquipment, HeroSale, HeroStatGrowth } from './types'
import { getDisplayHeroId, getOriginRealm, xpToNextLevel } from './utils'

/** The endpoint the game client reads Metis hero genes from (one owner per request). */
export const METIS_HERO_INDEXER_URL = 'https://temp-dfk-api.kingdom-studios.workers.dev/heroes'

export interface MetisHeroGenes {
  /** Decimal string (the indexer sends numbers; `fetchMetisHeroGenes` normalizes them). */
  id: string
  stat_genes: string
  visual_genes: string
}

/** Every hero an address owns on Metis, with genes. */
export async function fetchMetisHeroGenes(ctx: ChainContext, owner: string): Promise<MetisHeroGenes[]> {
  const base = (ctx.metisIndexerUrl ?? METIS_HERO_INDEXER_URL).replace(/\/$/, '')
  const res = await fetch(`${base}/${owner}`)
  if (!res.ok) throw new Error(`Metis hero indexer returned ${res.status} for ${owner}`)
  const data: { id: string | number; stat_genes: string; visual_genes: string }[] | null = await res.json()
  return (data ?? []).map(h => ({ id: String(h.id), stat_genes: String(h.stat_genes), visual_genes: String(h.visual_genes) }))
}

const n = (v: { toString(): string } | number) => Number(v.toString())
const idOrNull = (v: { isZero(): boolean; toString(): string } | undefined) => (v && !v.isZero() ? v.toString() : null)
const EPOCH = new Date(0)

/**
 * Converts a Metis `PVPDiamond.getHeroes` struct into a `Hero`. Sundered Isles stores no names,
 * generation, summoning or stamina on chain, so those fields carry neutral defaults; pass
 * `genes` (from the indexer) to fill in the gene-derived fields.
 */
export function parseMetisHero(
  raw: any,
  chainId: number,
  { genes, owner, sale }: { genes?: { stat: string; visual: string }; owner?: string; sale?: HeroSale } = {}
): Hero {
  const id = raw.id.toString()
  const displayId = getDisplayHeroId(id)
  const statGenes = decodeStatGenes(genes?.stat ?? 0)
  const visualGenes = decodeVisualGenes(genes?.visual ?? 0)
  const level = n(raw.level)
  const growth = (kind: 'P' | 'S'): HeroStatGrowth => ({
    strength: n(raw[`strength${kind}Growth`]),
    intelligence: n(raw[`intelligence${kind}Growth`]),
    wisdom: n(raw[`wisdom${kind}Growth`]),
    luck: n(raw[`luck${kind}Growth`]),
    agility: n(raw[`agility${kind}Growth`]),
    vitality: n(raw[`vitality${kind}Growth`]),
    endurance: n(raw[`endurance${kind}Growth`]),
    dexterity: n(raw[`dexterity${kind}Growth`]),
    // HP/MP growth is stored once, not split into primary and secondary.
    hpSm: n(raw.hpSmallGrowth),
    hpRg: n(raw.hpMediumGrowth),
    hpLg: n(raw.hpLargeGrowth),
    mpSm: n(raw.mpSmallGrowth),
    mpRg: n(raw.mpMediumGrowth),
    mpLg: n(raw.mpLargeGrowth),
  })
  const equipment: HeroEquipment = {
    petId: idOrNull(raw.petId),
    weapon1Id: idOrNull(raw.weapon1Id),
    weapon1VisageId: idOrNull(raw.weapon1VisageId),
    weapon2Id: idOrNull(raw.weapon2Id),
    weapon2VisageId: idOrNull(raw.weapon2VisageId),
    offhand1Id: idOrNull(raw.offhand1Id),
    offhand1VisageId: idOrNull(raw.offhand1VisageId),
    offhand2Id: idOrNull(raw.offhand2Id),
    offhand2VisageId: idOrNull(raw.offhand2VisageId),
    armorId: idOrNull(raw.armorId),
    armorVisageId: idOrNull(raw.armorVisageId),
    accessoryId: idOrNull(raw.accessoryId),
    accessoryVisageId: idOrNull(raw.accessoryVisageId),
  }
  const summonsRemaining = n(raw.summonsRemaining)

  return {
    id,
    displayId,
    chainId,
    originRealm: getOriginRealm(id),
    owner,
    // Names aren't stored on Metis; the game shows a placeholder too.
    name: `Hero #${displayId}`,
    firstName: '',
    lastName: '',
    gender: genes ? visualGenes.gender.d : undefined,
    class: HERO_CLASSES[n(raw.class) as keyof typeof HERO_CLASSES],
    subClass: HERO_CLASSES[n(raw.subclass) as keyof typeof HERO_CLASSES],
    profession: genes ? statGenes.profession.d : undefined,
    element: genes ? statGenes.element.d : undefined,
    background: genes ? visualGenes.background.d : undefined,
    rarity: RARITIES[n(raw.rarity)] ?? 'common',
    shiny: false,
    shinyStyle: 0,
    generation: 0,
    level,
    xp: n(raw.xp),
    xpToNextLevel: xpToNextLevel(level),
    stats: {
      strength: n(raw.strength),
      intelligence: n(raw.intelligence),
      wisdom: n(raw.wisdom),
      luck: n(raw.luck),
      agility: n(raw.agility),
      vitality: n(raw.vitality),
      endurance: n(raw.endurance),
      dexterity: n(raw.dexterity),
      hp: n(raw.hp),
      mp: n(raw.mp),
      stamina: 0,
    },
    primaryGrowth: growth('P'),
    secondaryGrowth: growth('S'),
    skills: { mining: 0, gardening: 0, fishing: 0, foraging: 0 },
    staminaFullAt: EPOCH,
    currentQuest: null,
    summonedAt: EPOCH,
    nextSummonAt: EPOCH,
    summons: 0,
    maxSummons: summonsRemaining,
    summonsRemaining,
    summonerId: '0',
    assistantId: '0',
    equipment,
    statGenes,
    visualGenes,
    genes: { stat: genes?.stat ?? '0', visual: genes?.visual ?? '0' },
    ...(sale ? { sale } : {}),
    ...(genes ? {} : { incomplete: true as const }),
  }
}
