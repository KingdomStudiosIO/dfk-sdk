export type ItemType =
  | 'ingredient'
  | 'consumable'
  | 'potionCrate'
  | 'crystal'
  | 'collectible'
  | 'scrap'
  | 'stone'
  | 'balance'
  | 'voucher'
  | 'subcollection'
  | 'collection'
  | 'summon'
  | 'hidden'
  | 'rune'
  | 'pet'
  | (string & {})

export type ItemCategory = 'PLANT' | 'FISH' | 'CONSUMABLE' | 'STONE_CRYSTAL_RUNE' | 'PET' | 'MISC' | (string & {})

/** Static metadata for an in-game inventory item. */
export interface ItemDefinition {
  /** Stable identifier, e.g. `healthPotion`. */
  key: string
  name: string
  description: string
  /** Image URL, or an `asset:` reference; use `getItemImageUrl` to resolve. */
  image: string
  type: ItemType
  category: ItemCategory
  decimals: number
  standard: 'erc20' | 'erc1155'
  /** ERC-1155 token id for items that share a collection contract. */
  tokenId?: number
  symbol?: string
  consumable?: boolean
  soulbound?: boolean
  /** Token address keyed by chain id. Absent chains don't have the item. */
  addresses: Readonly<Record<string, string>>
}

export interface ItemBalance {
  item: ItemDefinition
  address: string
  /** Raw on-chain amount. */
  raw: bigint
  /** Human-readable amount using the item's decimals. */
  formatted: string
}
