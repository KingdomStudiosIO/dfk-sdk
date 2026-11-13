import { Contract, type providers, type utils } from 'ethers'
import { MULTICALL_ABI } from './abis'
import { getMulticallAddress } from './addresses'

export interface Call {
  target: string
  iface: utils.Interface
  method: string
  args?: readonly unknown[]
}

export type CallResult<T = any> = { success: true; value: T } | { success: false; value: undefined }

const DEFAULT_BATCH = 200

/**
 * Batches read-only calls through the chain's Multicall contract. Failed calls come back as
 * `{ success: false }` instead of rejecting the whole batch.
 */
export async function multicall<T = any>(
  provider: providers.Provider,
  chainId: number,
  calls: readonly Call[],
  { batchSize = DEFAULT_BATCH }: { batchSize?: number } = {}
): Promise<CallResult<T>[]> {
  if (calls.length === 0) return []
  const mc = new Contract(getMulticallAddress(chainId), MULTICALL_ABI, provider)
  const results: CallResult<T>[] = []

  for (let i = 0; i < calls.length; i += batchSize) {
    const chunk = calls.slice(i, i + batchSize)
    const encoded = chunk.map(c => ({ target: c.target, callData: c.iface.encodeFunctionData(c.method, c.args ?? []) }))
    const raw: { success: boolean; returnData: string }[] = await mc.callStatic.tryAggregate(false, encoded)
    raw.forEach((r, j) => {
      const call = chunk[j]
      if (!r.success || r.returnData === '0x') {
        results.push({ success: false, value: undefined })
        return
      }
      try {
        const decoded = call.iface.decodeFunctionResult(call.method, r.returnData)
        results.push({ success: true, value: (decoded.length === 1 ? decoded[0] : decoded) as T })
      } catch {
        results.push({ success: false, value: undefined })
      }
    })
  }
  return results
}
