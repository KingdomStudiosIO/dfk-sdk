import { utils } from 'ethers'
import { ERC1155_ABI, ERC20_ABI } from '../abis'
import { formatAmount } from '../format'
import type { ChainContext } from '../context'
import { multicall } from '../multicall'
import { getItems } from './catalog'
import type { ItemBalance, ItemDefinition } from './types'

const erc20 = new utils.Interface(ERC20_ABI as any)
const erc1155 = new utils.Interface(ERC1155_ABI as any)

/**
 * Balances of catalog items for one address, in a single batched multicall.
 * Defaults to every item on the chain; pass `items` to check a subset.
 */
export async function getItemBalances(
  ctx: ChainContext,
  owner: string,
  {
    items = getItems(ctx.chainId),
    includeZero = false,
  }: { items?: readonly ItemDefinition[]; includeZero?: boolean } = {}
): Promise<ItemBalance[]> {
  // A collection parent has no token id of its own; its balances live on its pages.
  const readable = items.filter(i => i.addresses[ctx.chainId] && (i.standard === 'erc20' || i.tokenId !== undefined))

  const results = await multicall(
    ctx.provider,
    ctx.chainId,
    readable.map(item =>
      item.standard === 'erc1155'
        ? { target: item.addresses[ctx.chainId], iface: erc1155, method: 'balanceOf', args: [owner, item.tokenId] }
        : { target: item.addresses[ctx.chainId], iface: erc20, method: 'balanceOf', args: [owner] }
    )
  )

  const balances: ItemBalance[] = []
  results.forEach((r, i) => {
    if (!r.success) return
    const raw = BigInt(r.value.toString())
    if (raw === 0n && !includeZero) return
    const item = readable[i]
    balances.push({ item, address: item.addresses[ctx.chainId], raw, formatted: formatAmount(raw, item.decimals) })
  })
  return balances
}

export async function getItemBalance(ctx: ChainContext, owner: string, item: ItemDefinition): Promise<ItemBalance> {
  const [balance] = await getItemBalances(ctx, owner, { items: [item], includeZero: true })
  if (!balance) throw new Error(`Could not read ${item.key} balance on chain ${ctx.chainId}`)
  return balance
}
