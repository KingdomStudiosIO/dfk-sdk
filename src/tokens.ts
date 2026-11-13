import { utils } from 'ethers'
import { ERC20_ABI, MULTICALL_ABI } from './abis'
import { getMulticallAddress } from './addresses'
import { ChainId, getChain } from './chains'
import type { ChainContext } from './context'
import { formatAmount } from './format'
import { getItem } from './items/catalog'
import { multicall, type Call } from './multicall'

export const NATIVE = 'native' as const

export interface TokenDefinition {
  symbol: string
  name: string
  decimals: number
  logo: string
  /** Address per chain id, or `native` for the chain's gas token. */
  addresses: Readonly<Partial<Record<ChainId, string>>>
}

export interface TokenBalance {
  token: TokenDefinition
  address: string
  raw: bigint
  formatted: string
}

const CDN = 'https://defi-kingdoms.b-cdn.net/art-assets/tokens'

// GOLD is technically an inventory item; its addresses come from the synced item catalog.
const GOLD_ITEM = getItem('goldBag')

/** The game's fungible currencies. */
export const TOKENS: readonly TokenDefinition[] = [
  {
    symbol: 'JEWEL',
    name: 'Jewel',
    decimals: 18,
    logo: `${CDN}/jewel_token_x2.png`,
    addresses: {
      [ChainId.DFK_MAINNET]: NATIVE,
      [ChainId.DFK_TESTNET]: NATIVE,
      [ChainId.KAIA_MAINNET]: '0x30C103f8f5A3A732DFe2dCE1Cc9446f545527b43',
      [ChainId.KAIA_TESTNET]: '0xbb227Fcf45F9Dc5deF87208C534EAB1006d8Cc8d',
      [ChainId.METIS_MAINNET]: '0x17C09cfC96C865CF546d73365Cedb6dC66986963',
      [ChainId.METIS_TESTNET]: '0xBBd856826174307285149457Cc58f4ff443371Dc',
      [ChainId.AVALANCHE_MAINNET]: '0x997Ddaa07d716995DE90577C123Db411584E5E46',
      [ChainId.AVALANCHE_FUJI]: '0x2C5911d6570F4AbbBe4E436e9aC9731C01Cddf7e',
    },
  },
  {
    symbol: 'CRYSTAL',
    name: 'Crystal',
    decimals: 18,
    logo: `${CDN}/crystal_token_x2.png`,
    addresses: {
      [ChainId.DFK_MAINNET]: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
      [ChainId.DFK_TESTNET]: '0xa5c47B4bEb35215fB0CF0Ea6516F9921591c3aCE',
      [ChainId.AVALANCHE_MAINNET]: '0xad8F272ee3aE93A17415b55d0F10eFC4D1Bb9113',
      [ChainId.AVALANCHE_FUJI]: '0x624E05c486330935B8cB43E5CcE2a0Ab085fD04D',
    },
  },
  {
    symbol: 'JADE',
    name: 'Jade',
    decimals: 18,
    logo: `${CDN}/jade_token.png`,
    addresses: {
      [ChainId.KAIA_MAINNET]: '0xB3F5867E277798b50ba7A71C0b24FDcA03045eDF',
      [ChainId.KAIA_TESTNET]: '0x4dDD03B3850794534e01F2C95C93a45855058e19',
    },
  },
  ...(GOLD_ITEM
    ? [
        {
          symbol: 'GOLD',
          name: 'Gold',
          decimals: GOLD_ITEM.decimals,
          logo: GOLD_ITEM.image,
          addresses: GOLD_ITEM.addresses as TokenDefinition['addresses'],
        },
      ]
    : []),
  {
    symbol: 'xJEWEL',
    name: 'xJEWEL',
    decimals: 18,
    logo: `${CDN}/jewel_token_x2.png`,
    addresses: {
      [ChainId.DFK_MAINNET]: '0x77f2656d04E158f915bC22f07B779D94c1DC47Ff',
      [ChainId.DFK_TESTNET]: '0xE37ca419F9BfdC80590f2D5B1CeD7955d343f315',
    },
  },
  {
    symbol: 'KAIA',
    name: 'Kaia',
    decimals: 18,
    logo: 'https://firebasestorage.googleapis.com/v0/b/defi-kingdoms.appspot.com/o/tokens%2FKAIA.png?alt=media',
    addresses: { [ChainId.KAIA_MAINNET]: NATIVE, [ChainId.KAIA_TESTNET]: NATIVE },
  },
  {
    symbol: 'METIS',
    name: 'Metis',
    decimals: 18,
    logo: 'https://assets.coingecko.com/coins/images/15595/standard/Metis_Black_Bg.png',
    addresses: { [ChainId.METIS_MAINNET]: NATIVE, [ChainId.METIS_TESTNET]: NATIVE },
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    decimals: 18,
    logo: 'https://firebasestorage.googleapis.com/v0/b/defi-kingdoms.appspot.com/o/tokens%2FAVAX.png?alt=media',
    addresses: {
      [ChainId.AVALANCHE_MAINNET]: NATIVE,
      [ChainId.AVALANCHE_FUJI]: NATIVE,
      [ChainId.DFK_MAINNET]: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
      [ChainId.DFK_TESTNET]: '0x992Bdf6a1B1c91BBA89765cd7B5a60894c6180a0',
    },
  },
  {
    symbol: 'USDC',
    name: 'USDC',
    decimals: 18,
    logo: 'https://firebasestorage.googleapis.com/v0/b/defi-kingdoms.appspot.com/o/tokens%2F1USDC.png?alt=media',
    addresses: {
      [ChainId.DFK_MAINNET]: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
      [ChainId.DFK_TESTNET]: '0x0938BC0B609870789dEe2535BeA45DDb1C76EB60',
    },
  },
]

export function getTokens(chainId: number): TokenDefinition[] {
  return TOKENS.filter(t => t.addresses[chainId as ChainId])
}

export function getToken(symbol: string, chainId?: number): TokenDefinition | undefined {
  const s = symbol.toLowerCase()
  return TOKENS.find(t => t.symbol.toLowerCase() === s && (chainId === undefined || t.addresses[chainId as ChainId]))
}

/** The chain's power token: CRYSTAL on DFK Chain and Avalanche C-Chain, JADE on Kaia. Used for hero sale prices. */
export function getPowerToken(chainId: number): TokenDefinition | undefined {
  const realm = getChain(chainId).realm
  if (realm === 'crystalvale' || realm === 'avalanche') return getToken('CRYSTAL', chainId)
  if (realm === 'serendale2') return getToken('JADE', chainId)
  return undefined
}

const erc20 = new utils.Interface(ERC20_ABI as any)
const mcIface = new utils.Interface(MULTICALL_ABI as any)

/** Balances of the game's tokens (native gas token included) in one multicall. */
export async function getTokenBalances(
  ctx: ChainContext,
  owner: string,
  { tokens = getTokens(ctx.chainId), includeZero = true }: { tokens?: readonly TokenDefinition[]; includeZero?: boolean } = {}
): Promise<TokenBalance[]> {
  const list = tokens.filter(t => t.addresses[ctx.chainId as ChainId])
  const calls: Call[] = list.map(t => {
    const address = t.addresses[ctx.chainId as ChainId]!
    return address === NATIVE
      ? { target: getMulticallAddress(ctx.chainId), iface: mcIface, method: 'getEthBalance', args: [owner] }
      : { target: address, iface: erc20, method: 'balanceOf', args: [owner] }
  })
  const results = await multicall(ctx.provider, ctx.chainId, calls)

  const balances: TokenBalance[] = []
  results.forEach((r, i) => {
    if (!r.success) return
    const raw = BigInt(r.value.toString())
    if (raw === 0n && !includeZero) return
    const token = list[i]
    balances.push({ token, address: token.addresses[ctx.chainId as ChainId]!, raw, formatted: formatAmount(raw, token.decimals) })
  })
  return balances
}
