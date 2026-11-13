import { getArtUrl, type AssetConfig } from '../config'
import { EQUIPMENT_DATA } from '../generated/equipment'
import type { EquipmentContractKind, EquipmentKind } from './types'

export { EQUIPMENT_DATA }

type Table = Record<number, string>
type Template = { template: string; divisor?: number }
const data = EQUIPMENT_DATA as unknown as {
  weaponTypes: Table
  armorTypes: Table
  accessoryTypes: Table
  rarities: Table
  craftedBy: Record<string, string>
  stats: Table
  names: { weapon: Record<number, Table>; armor: Record<number, Table>; accessory: Table; offhand: Table }
  lore: { weapon: Record<number, Table>; armor: Record<number, Table>; accessory: Table; offhand: Table }
  bonuses: Record<EquipmentKind, Record<number, Template>>
  enchantments: Record<EquipmentKind, Record<number, Template>>
}

/** Accessory-contract items with this type are accessories; the rest are offhands. */
export const ACCESSORY_TYPE_ACCESSORY = 1

export function getEquipmentContractKind(kind: EquipmentKind): EquipmentContractKind {
  return kind === 'offhand' ? 'accessory' : kind
}

export function getEquipmentName(kind: EquipmentKind, typeId: number, displayId: number): string {
  if (kind === 'weapon') return data.names.weapon[typeId]?.[displayId] ?? 'Unknown Weapon'
  if (kind === 'armor') return data.names.armor[typeId]?.[displayId] ?? 'Unknown Armor'
  return data.names[kind][displayId] ?? (kind === 'offhand' ? 'Unknown Offhand' : 'Unknown Accessory')
}

export function getEquipmentLore(kind: EquipmentKind, typeId: number, displayId: number): string | undefined {
  if (kind === 'weapon' || kind === 'armor') return data.lore[kind][typeId]?.[displayId] || undefined
  return data.lore[kind][displayId] || undefined
}

export function getEquipmentTypeName(kind: EquipmentKind, typeId: number): string {
  if (kind === 'weapon') return data.weaponTypes[typeId] ?? 'Weapon'
  if (kind === 'armor') return `${data.armorTypes[typeId] ?? ''} Armor`.trim()
  return data.accessoryTypes[typeId] ?? (kind === 'offhand' ? 'Offhand' : 'Accessory')
}

export function getEquipmentRarity(rarityId: number): string {
  return data.rarities[rarityId] ?? 'common'
}

export function getCraftedByLabel(craftedBy: { toString(): string }): string {
  return data.craftedBy[craftedBy.toString()] ?? 'Unknown'
}

/** Stat abbreviation for a weapon scaling stat id (1 = STR … 8 = LCK). */
export function getEquipmentStatLabel(statId: number): string | undefined {
  return data.stats[statId]
}

const formatValue = (v: number) => String(Math.round(v * 1000) / 1000)

function describe(table: Record<number, Template>, id: number, scalar: number) {
  const entry = table[id]
  const value = entry?.divisor ? scalar / entry.divisor : scalar
  const text = entry
    ? entry.template
        .replace(/\{value\}/g, formatValue(value))
        // Range bonuses pack the bounds into one scalar: low byte and the rest.
        .replace(/\{low\}/g, String(scalar % 256))
        .replace(/\{high\}/g, String(Math.floor(scalar / 256)))
    : `Unknown bonus ${id}`
  return { id, scalar, value, text }
}

export function describeEquipmentBonus(kind: EquipmentKind, id: number, scalar: number) {
  return describe(data.bonuses[kind], id, scalar)
}

export function describeEquipmentEnchantment(kind: EquipmentKind, id: number, scalar: number) {
  return describe(data.enchantments[kind], id, scalar)
}

/** Icon for an equipment type and display id. Offhands share the accessory folder. */
export function getEquipmentImageUrl(
  kind: EquipmentKind,
  typeId: number,
  displayId: number,
  assets?: Partial<AssetConfig>
): string {
  return getArtUrl(`equipment/${getEquipmentContractKind(kind)}/${typeId}-${displayId}.png`, assets)
}
