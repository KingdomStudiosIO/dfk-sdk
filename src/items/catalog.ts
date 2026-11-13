import { resolveAssetUrl, type AssetConfig } from '../config'
import { ITEM_CATALOG } from '../generated/items'
import type { ItemDefinition } from './types'

export { ITEM_CATALOG }

const byKey = new Map(ITEM_CATALOG.map(i => [i.key, i]))

export function getItem(key: string): ItemDefinition | undefined {
  return byKey.get(key)
}

/**
 * Items deployed on a chain. Left out by default: `hidden` bookkeeping items, and `balance`
 * currencies (JEWEL, CRYSTAL, JADE), which the tokens module reports along with GOLD.
 */
export function getItems(
  chainId: number,
  { includeHidden = false, includeCurrencies = false }: { includeHidden?: boolean; includeCurrencies?: boolean } = {}
): ItemDefinition[] {
  return ITEM_CATALOG.filter(
    i => i.addresses[chainId] && (includeHidden || i.type !== 'hidden') && (includeCurrencies || i.type !== 'balance')
  )
}

/** Finds an item by token address (and ERC-1155 token id, for shared collection contracts). */
export function getItemByAddress(chainId: number, address: string, tokenId?: number): ItemDefinition | undefined {
  const a = address.toLowerCase()
  return ITEM_CATALOG.find(
    i => i.addresses[chainId]?.toLowerCase() === a && (tokenId === undefined || i.tokenId === tokenId)
  )
}

export function getItemAddress(item: ItemDefinition, chainId: number): string | undefined {
  return item.addresses[chainId]
}

export function getItemImageUrl(item: ItemDefinition, assets?: Partial<AssetConfig>): string {
  return resolveAssetUrl(item.image, assets)
}
