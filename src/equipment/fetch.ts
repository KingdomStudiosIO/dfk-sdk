import { Contract, utils } from 'ethers'
import { ACCESSORY_CORE_ABI, ARMOR_CORE_ABI, EQUIPMENT_AUCTION_ABI, WEAPON_CORE_ABI } from '../abis'
import { getContractAddress, type ContractName } from '../addresses'
import { getListingsForHeldTokens } from '../auctions'
import type { ChainContext } from '../context'
import type { HeroEquipment } from '../heroes/types'
import { multicall } from '../multicall'
import { getEquipmentContractKind } from './catalog'
import { parseEquipment } from './parse'
import type { Equipment, EquipmentContractKind, EquipmentKind, HeroGear } from './types'

type IdInput = bigint | string | number

const CONTRACTS: Record<
  EquipmentContractKind,
  { core: ContractName; auction: ContractName; iface: utils.Interface; getMany: string; userIds: string }
> = {
  weapon: { core: 'weaponCore', auction: 'weaponAuction', iface: new utils.Interface(WEAPON_CORE_ABI as any), getMany: 'getWeapons', userIds: 'getUserWeaponIds' },
  armor: { core: 'armorCore', auction: 'armorAuction', iface: new utils.Interface(ARMOR_CORE_ABI as any), getMany: 'getArmors', userIds: 'getUserArmorIds' },
  accessory: { core: 'accessoryCore', auction: 'accessoryAuction', iface: new utils.Interface(ACCESSORY_CORE_ABI as any), getMany: 'getAccessories', userIds: 'getUserAccessoryIds' },
}

/** Whether this chain has equipment contracts. */
export function hasEquipment(chainId: number): boolean {
  return Boolean(getContractAddress('weaponCore', chainId))
}

/**
 * Fetches equipment of one kind by id. `offhand` and `accessory` read the same contract and
 * either one returns both kinds. Unknown ids are skipped; match on `equipment.id`.
 */
export async function getEquipment(ctx: ChainContext, kind: EquipmentKind, ids: readonly IdInput[]): Promise<Equipment[]> {
  const contractKind = getEquipmentContractKind(kind)
  const cfg = CONTRACTS[contractKind]
  const core = getContractAddress(cfg.core, ctx.chainId)
  if (!core || ids.length === 0) return []
  const unique = [...new Set(ids.map(id => id.toString()))]

  const [results, ownerResults] = await Promise.all([
    multicall(
      ctx.provider,
      ctx.chainId,
      // The batch getters revert on unknown ids, so ask for each item separately.
      unique.map(id => ({ target: core, iface: cfg.iface, method: cfg.getMany, args: [[id]] })),
      { batchSize: 100 }
    ),
    multicall<string>(
      ctx.provider,
      ctx.chainId,
      unique.map(id => ({ target: core, iface: cfg.iface, method: 'ownerOf', args: [id] }))
    ),
  ])
  const owners = new Map<string, string>()
  ownerResults.forEach((r, i) => r.success && owners.set(unique[i], r.value))
  const sales = await getListingsForHeldTokens(ctx, cfg.auction, owners)

  const out: Equipment[] = []
  results.forEach((r, i) => {
    const raw = r.success ? r.value[0] : undefined
    if (!raw || !owners.has(unique[i])) return
    const sale = sales.get(unique[i])
    out.push(parseEquipment(raw, contractKind, ctx.chainId, { owner: sale?.seller ?? owners.get(unique[i]), sale }))
  })
  return out
}

/** All equipment an address owns (optionally limited to some kinds), including listed items. */
export async function getEquipmentByOwner(
  ctx: ChainContext,
  owner: string,
  { kinds = ['weapon', 'armor', 'accessory'], includeListed = true }: { kinds?: readonly EquipmentContractKind[]; includeListed?: boolean } = {}
): Promise<Equipment[]> {
  const lists = await Promise.all(
    kinds.map(async kind => {
      const cfg = CONTRACTS[kind]
      const core = getContractAddress(cfg.core, ctx.chainId)
      if (!core) return []
      const auction = getContractAddress(cfg.auction, ctx.chainId)
      const [held, listed] = await Promise.all([
        new Contract(core, cfg.iface, ctx.provider)[cfg.userIds](owner) as Promise<{ toString(): string }[]>,
        includeListed && auction
          ? (new Contract(auction, EQUIPMENT_AUCTION_ABI as any, ctx.provider).getUserAuctions(owner) as Promise<{ toString(): string }[]>)
          : Promise.resolve([]),
      ])
      return getEquipment(ctx, kind, [...held, ...listed].map(id => id.toString()))
    })
  )
  return lists.flat()
}

const SLOTS: [keyof HeroGear, keyof HeroEquipment, EquipmentContractKind][] = [
  ['weapon1', 'weapon1Id', 'weapon'],
  ['weapon1Visage', 'weapon1VisageId', 'weapon'],
  ['weapon2', 'weapon2Id', 'weapon'],
  ['weapon2Visage', 'weapon2VisageId', 'weapon'],
  ['offhand1', 'offhand1Id', 'accessory'],
  ['offhand1Visage', 'offhand1VisageId', 'accessory'],
  ['offhand2', 'offhand2Id', 'accessory'],
  ['offhand2Visage', 'offhand2VisageId', 'accessory'],
  ['armor', 'armorId', 'armor'],
  ['armorVisage', 'armorVisageId', 'armor'],
  ['accessory', 'accessoryId', 'accessory'],
  ['accessoryVisage', 'accessoryVisageId', 'accessory'],
]

/** Resolves the equipment ids on a hero into full items, one request per contract. */
export async function getHeroGear(ctx: ChainContext, hero: { equipment: HeroEquipment }): Promise<HeroGear> {
  const byContract: Record<EquipmentContractKind, string[]> = { weapon: [], armor: [], accessory: [] }
  for (const [, idKey, contract] of SLOTS) {
    const id = hero.equipment[idKey]
    if (id) byContract[contract].push(id)
  }
  const fetched = await Promise.all(
    (Object.keys(byContract) as EquipmentContractKind[]).map(k => getEquipment(ctx, k, byContract[k]))
  )
  const found = new Map<string, Equipment>()
  ;(Object.keys(byContract) as EquipmentContractKind[]).forEach((k, i) => fetched[i].forEach(e => found.set(`${k}:${e.id}`, e)))

  const gear = {} as HeroGear
  for (const [slot, idKey, contract] of SLOTS) {
    const id = hero.equipment[idKey]
    gear[slot] = (id && found.get(`${contract}:${id}`)) || null
  }
  return gear
}
