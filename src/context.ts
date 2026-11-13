import type { providers } from 'ethers'

/** What every chain-reading function needs. `createDFKClient` builds one for you. */
export interface ChainContext {
  provider: providers.Provider
  chainId: number
  /**
   * Metis only: service that returns an owner's hero ids and genes, which Sundered Isles keeps
   * off-chain. Defaults to the endpoint the game client uses (`METIS_HERO_INDEXER_URL`).
   */
  metisIndexerUrl?: string
}
