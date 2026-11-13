export enum ChainId {
  /** DFK Chain is no longer active; the game has moved to Avalanche C-Chain. Kept for archival reads. */
  DFK_MAINNET = 53935,
  DFK_TESTNET = 335,
  KAIA_MAINNET = 8217,
  KAIA_TESTNET = 1001,
  METIS_MAINNET = 1088,
  METIS_TESTNET = 59902,
  AVALANCHE_MAINNET = 43114,
  AVALANCHE_FUJI = 43113,
}

/** `avalanche` is the SDK's provisional name for Avalanche C-Chain; the game hasn't named that realm yet. */
export type Realm = 'serendale' | 'crystalvale' | 'sunderedisles' | 'serendale2' | 'avalanche'

export interface NativeCurrency {
  name: string
  symbol: string
  decimals: number
}

export interface ChainConfig {
  id: ChainId
  name: string
  testnet: boolean
  rpcUrls: readonly string[]
  explorerUrl: string
  nativeCurrency: NativeCurrency
  /** The in-game realm hosted on this chain, if any. */
  realm?: Realm
  /**
   * How hero data is read on this chain.
   * - `v3`: HeroCoreDiamond `getHeroV3` (DFK Chain, Kaia, Avalanche)
   * - `metis`: hero state from the PVP diamond; genes come from the game's Metis hero indexer,
   *   because Sundered Isles keeps them off-chain
   */
  heroes: 'v3' | 'metis'
  /** Largest block span the public RPC accepts per `eth_getLogs` request. Defaults to 2048. */
  logBlockRange?: number
  /** Multicall3 deployment, used instead of the game's multicall when set. */
  multicall3?: string
}

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const CHAINS: Record<ChainId, ChainConfig> = {
  [ChainId.DFK_MAINNET]: {
    id: ChainId.DFK_MAINNET,
    name: 'DFK Chain',
    testnet: false,
    rpcUrls: ['https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc'],
    explorerUrl: 'https://subnets.avax.network/defi-kingdoms',
    nativeCurrency: { name: 'Jewel', symbol: 'JEWEL', decimals: 18 },
    realm: 'crystalvale',
    heroes: 'v3',
  },
  [ChainId.DFK_TESTNET]: {
    id: ChainId.DFK_TESTNET,
    name: 'DFK Chain Testnet',
    testnet: true,
    rpcUrls: ['https://subnets.avax.network/defi-kingdoms/dfk-chain-testnet/rpc'],
    explorerUrl: 'https://subnets-test.avax.network/defi-kingdoms',
    nativeCurrency: { name: 'Jewel', symbol: 'JEWEL', decimals: 18 },
    realm: 'crystalvale',
    heroes: 'v3',
  },
  [ChainId.KAIA_MAINNET]: {
    id: ChainId.KAIA_MAINNET,
    name: 'Kaia',
    testnet: false,
    rpcUrls: ['https://public-en.node.kaia.io', 'https://kaia.rpc.defikingdoms.com/'],
    explorerUrl: 'https://kaiascan.io',
    nativeCurrency: { name: 'Kaia', symbol: 'KAIA', decimals: 18 },
    realm: 'serendale2',
    heroes: 'v3',
    logBlockRange: 500_000,
  },
  [ChainId.KAIA_TESTNET]: {
    id: ChainId.KAIA_TESTNET,
    name: 'Kaia Kairos',
    testnet: true,
    rpcUrls: ['https://public-en-kairos.node.kaia.io'],
    explorerUrl: 'https://kairos.kaiascan.io',
    nativeCurrency: { name: 'Kaia', symbol: 'KAIA', decimals: 18 },
    realm: 'serendale2',
    heroes: 'v3',
  },
  [ChainId.METIS_MAINNET]: {
    id: ChainId.METIS_MAINNET,
    name: 'Metis',
    testnet: false,
    rpcUrls: ['https://andromeda.metis.io/?owner=1088'],
    explorerUrl: 'https://andromeda-explorer.metis.io',
    nativeCurrency: { name: 'Metis', symbol: 'METIS', decimals: 18 },
    realm: 'sunderedisles',
    heroes: 'metis',
    logBlockRange: 10_000,
    multicall3: MULTICALL3,
  },
  [ChainId.METIS_TESTNET]: {
    id: ChainId.METIS_TESTNET,
    name: 'Metis Sepolia',
    testnet: true,
    rpcUrls: ['https://sepolia.metisdevops.link/'],
    explorerUrl: 'https://sepolia-explorer.metisdevops.link',
    nativeCurrency: { name: 'Metis', symbol: 'METIS', decimals: 18 },
    realm: 'sunderedisles',
    heroes: 'metis',
    multicall3: MULTICALL3,
  },
  [ChainId.AVALANCHE_MAINNET]: {
    id: ChainId.AVALANCHE_MAINNET,
    name: 'Avalanche C-Chain',
    testnet: false,
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    realm: 'avalanche',
    heroes: 'v3',
    multicall3: MULTICALL3,
  },
  [ChainId.AVALANCHE_FUJI]: {
    id: ChainId.AVALANCHE_FUJI,
    name: 'Avalanche Fuji',
    testnet: true,
    rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    realm: 'avalanche',
    heroes: 'v3',
    multicall3: MULTICALL3,
  },
}

export function getChain(chainId: number): ChainConfig {
  const chain = CHAINS[chainId as ChainId]
  if (!chain) throw new Error(`Unsupported chainId ${chainId}. Supported: ${Object.keys(CHAINS).join(', ')}`)
  return chain
}

export function isSupportedChain(chainId: number): chainId is ChainId {
  return chainId in CHAINS
}

export function getExplorerLink(
  chainId: number,
  value: string,
  type: 'address' | 'tx' | 'token' | 'block' = 'address'
): string {
  return `${getChain(chainId).explorerUrl}/${type}/${value}`
}
