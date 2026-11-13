import type { AuctionListing } from '../auctions'
import { getOriginRealm } from '../heroes/utils'
import {
  ACCESSORY_TYPE_ACCESSORY,
  describeEquipmentBonus,
  describeEquipmentEnchantment,
  getCraftedByLabel,
  getEquipmentImageUrl,
  getEquipmentLore,
  getEquipmentName,
  getEquipmentRarity,
  getEquipmentStatLabel,
  getEquipmentTypeName,
} from './catalog'
import type { Equipment, EquipmentBonus, EquipmentContractKind, EquipmentKind, StatScaling } from './types'

const n = (v: { toString(): string } | number) => Number(v.toString())

function bonuses(kind: EquipmentKind, src: any, count: number): EquipmentBonus[] {
  const out: EquipmentBonus[] = []
  for (let i = 1; i <= count; i++) {
    const id = n(src[`bonus${i}`])
    if (id > 0) out.push(describeEquipmentBonus(kind, id, n(src[`bonusScalar${i}`])))
  }
  return out
}

function enchantments(kind: EquipmentKind, state: any): EquipmentBonus[] {
  const out: EquipmentBonus[] = []
  for (let i = 1; i <= 3; i++) {
    const id = n(state[`enchantmentType${i}`])
    if (id > 0) out.push(describeEquipmentEnchantment(kind, id, n(state[`enchantmentScalar${i}`])))
  }
  return out
}

function scaling(src: any, prefix: 'p' | 'm'): StatScaling[] {
  const out: StatScaling[] = []
  for (let i = 1; i <= 3; i++) {
    const stat = getEquipmentStatLabel(n(src[`${prefix}ScalarStat${i}`]))
    if (stat) out.push({ stat, value: n(src[`${prefix}ScalarValue${i}`]), max: n(src[`${prefix}ScalarMax${i}`]) })
  }
  return out
}

/**
 * Converts a WeaponCore / ArmorCore / AccessoryCore struct (as decoded by ethers) into
 * `Equipment`. `contract` says which contract it came from; accessory-contract items are split
 * into accessories and offhands by their type.
 */
export function parseEquipment(
  raw: any,
  contract: EquipmentContractKind,
  chainId: number,
  extras: { owner?: string; sale?: AuctionListing } = {}
): Equipment {
  const id = raw.id.toString()
  const state = raw.stateEnchantments
  const display = contract === 'weapon' ? raw.displayInfoMagicAttack : contract === 'armor' ? raw.displayDefenseInfo : raw.displayBonusInfo
  const typeId = n(contract === 'weapon' ? display.weaponType : contract === 'armor' ? display.armorType : display.equipmentType)
  const kind: EquipmentKind = contract === 'accessory' && typeId !== ACCESSORY_TYPE_ACCESSORY ? 'offhand' : contract
  const displayId = n(display.displayId)
  const rarityId = n(display.rarity)
  const equippedTo = state.equippedTo.toString()

  const base: Equipment = {
    id,
    kind,
    chainId,
    originRealm: getOriginRealm(id),
    owner: extras.owner,
    name: getEquipmentName(kind, typeId, displayId),
    lore: getEquipmentLore(kind, typeId, displayId),
    typeId,
    typeName: getEquipmentTypeName(kind, typeId),
    displayId,
    rarity: getEquipmentRarity(rarityId),
    rarityId,
    craftedBy: getCraftedByLabel(display.craftedBy),
    image: getEquipmentImageUrl(kind, typeId, displayId),
    dyes: [n(display.dye1), n(display.dye2)],
    durability: n(state.durability),
    maxDurability: n(state.maxDurability),
    remainingRepairs: n(state.remainingRepairs),
    maxRepairs: n(state.maxRepairs),
    restorationCount: n(contract === 'armor' ? raw.bonusInfoExtras.restorationCount : display.restorationCount),
    equipRequirement: n(state.equipRequirement),
    equippedTo: equippedTo === '0' ? null : equippedTo,
    equippableAt: new Date(n(state.equippableAt) * 1000),
    bonuses: [],
    enchantments: enchantments(kind, state),
    ...(extras.sale ? { sale: extras.sale } : {}),
  }

  if (contract === 'weapon') {
    const phys = raw.bonusInfoPhysicalAttack
    base.bonuses = bonuses(kind, phys, 4)
    base.weapon = {
      baseDamage: n(phys.baseDamage),
      basePotency: n(display.basePotency),
      speedModifier: n(phys.speedModifier),
      accuracyRequirement: n(phys.accuracyRequirement),
      focusRequirement: n(display.focusRequirement),
      physicalAccuracyAtRequirement: n(phys.pAccuracyAtRequirement),
      magicalAccuracyAtRequirement: n(display.mAccuracyAtRequirement),
      physicalScaling: scaling(phys, 'p'),
      magicalScaling: scaling(display, 'm'),
    }
  } else if (contract === 'armor') {
    base.bonuses = bonuses(kind, raw.bonusInfoExtras, 5)
    base.armor = {
      physicalDefense: n(display.rawPhysDefense),
      magicalDefense: n(display.rawMagicDefense),
      physicalDefenseScalar: n(display.physDefScalar),
      magicalDefenseScalar: n(display.magicDefScalar),
      physicalDefenseScalarMax: n(display.pDefScalarMax),
      magicalDefenseScalarMax: n(display.mDefScalarMax),
      evasion: n(display.evasion),
    }
  } else {
    base.bonuses = bonuses(kind, display, 5)
  }
  return base
}
