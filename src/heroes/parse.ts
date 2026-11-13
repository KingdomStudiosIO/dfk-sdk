import { constants, type BigNumber } from 'ethers'
import { RARITIES, STAT_KEYS } from './constants'
import { decodeStatGenes, decodeVisualGenes } from './genes'
import type { Hero, HeroEquipment, HeroSale, HeroStatGrowth } from './types'
import { getDisplayHeroId, getHeroFirstName, getHeroLastName, getOriginRealm, xpToNextLevel } from './utils'

type Num = BigNumber | number

const toNum = (v: Num) => (typeof v === 'number' ? v : v.toNumber())
const toDate = (v: Num) => new Date(toNum(v) * 1000)
const idOrNull = (v: BigNumber | undefined) => (v && !v.isZero() ? v.toString() : null)

function parseGrowth(g: Record<string, number>): HeroStatGrowth {
  const out = {} as HeroStatGrowth
  for (const k of [...STAT_KEYS, 'hpSm', 'hpRg', 'hpLg', 'mpSm', 'mpRg', 'mpLg'] as const) out[k] = g[k]
  return out
}

/**
 * Converts a HeroCoreDiamond `getHeroV3` struct (as decoded by ethers) into a `Hero`.
 * Exposed so apps that fetch heroes themselves (indexers, subgraphs, their own multicall)
 * get the same shape as the SDK's fetchers.
 */
export function parseHeroV3(raw: any, chainId: number, extras: { owner?: string; sale?: HeroSale } = {}): Hero {
  const statGenes = decodeStatGenes(raw.info.statGenes)
  const visualGenes = decodeVisualGenes(raw.info.visualGenes)
  const gender = visualGenes.gender.d
  const firstName = getHeroFirstName(gender, toNum(raw.info.firstName))
  const lastName = getHeroLastName(toNum(raw.info.lastName))
  const level = toNum(raw.state.level)
  const summons = toNum(raw.summoningInfo.summons)
  const maxSummons = toNum(raw.summoningInfo.maxSummons)
  const eq = raw.equipment

  const equipment: HeroEquipment = {
    petId: idOrNull(eq?.petId),
    weapon1Id: idOrNull(eq?.weapon1Id),
    weapon1VisageId: idOrNull(eq?.weapon1VisageId),
    weapon2Id: idOrNull(eq?.weapon2Id),
    weapon2VisageId: idOrNull(eq?.weapon2VisageId),
    offhand1Id: idOrNull(eq?.offhand1Id),
    offhand1VisageId: idOrNull(eq?.offhand1VisageId),
    offhand2Id: idOrNull(eq?.offhand2Id),
    offhand2VisageId: idOrNull(eq?.offhand2VisageId),
    armorId: idOrNull(eq?.armorId),
    armorVisageId: idOrNull(eq?.armorVisageId),
    accessoryId: idOrNull(eq?.accessoryId),
    accessoryVisageId: idOrNull(eq?.accessoryVisageId),
  }

  const id = raw.id.toString()
  const quest: string = raw.state.currentQuest

  return {
    id,
    displayId: getDisplayHeroId(id),
    chainId,
    originRealm: getOriginRealm(id),
    owner: extras.owner,
    name: [firstName, lastName].filter(Boolean).join(' '),
    firstName,
    lastName,
    gender,
    class: statGenes.class.d,
    subClass: statGenes.subClass.d,
    profession: statGenes.profession.d,
    element: statGenes.element.d,
    background: visualGenes.background.d,
    rarity: RARITIES[toNum(raw.info.rarity)] ?? 'common',
    shiny: raw.info.shiny,
    shinyStyle: raw.info.shiny ? toNum(raw.info.shinyStyle) : 0,
    generation: toNum(raw.info.generation),
    level,
    xp: toNum(raw.state.xp),
    xpToNextLevel: xpToNextLevel(level),
    stats: {
      strength: raw.stats.strength,
      intelligence: raw.stats.intelligence,
      wisdom: raw.stats.wisdom,
      luck: raw.stats.luck,
      agility: raw.stats.agility,
      vitality: raw.stats.vitality,
      endurance: raw.stats.endurance,
      dexterity: raw.stats.dexterity,
      hp: raw.stats.hp,
      mp: raw.stats.mp,
      stamina: raw.stats.stamina,
    },
    primaryGrowth: parseGrowth(raw.primaryStatGrowth),
    secondaryGrowth: parseGrowth(raw.secondaryStatGrowth),
    skills: {
      mining: raw.professions.mining / 10,
      gardening: raw.professions.gardening / 10,
      fishing: raw.professions.fishing / 10,
      foraging: raw.professions.foraging / 10,
    },
    staminaFullAt: toDate(raw.state.staminaFullAt),
    currentQuest: quest && quest !== constants.AddressZero ? quest : null,
    summonedAt: toDate(raw.summoningInfo.summonedTime),
    nextSummonAt: toDate(raw.summoningInfo.nextSummonTime),
    summons,
    maxSummons,
    summonsRemaining: maxSummons < 11 ? maxSummons - summons : 11,
    summonerId: raw.summoningInfo.summonerId.toString(),
    assistantId: raw.summoningInfo.assistantId.toString(),
    equipment,
    statGenes,
    visualGenes,
    genes: { stat: raw.info.statGenes.toString(), visual: raw.info.visualGenes.toString() },
    ...(extras.sale ? { sale: extras.sale } : {}),
  }
}
