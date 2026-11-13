import { getChain } from './chains'
import { CONTRACT_ADDRESSES } from './generated/addresses'

export { CONTRACT_ADDRESSES }

export type ContractName = keyof typeof CONTRACT_ADDRESSES

export function getContractAddress(name: ContractName, chainId: number): string | undefined {
  const byChain = CONTRACT_ADDRESSES[name] as Record<string, string>
  return byChain[String(chainId)] || undefined
}

export function requireContractAddress(name: ContractName, chainId: number): string {
  const address = getContractAddress(name, chainId)
  if (!address) throw new Error(`${name} is not deployed on ${getChain(chainId).name} (${chainId})`)
  return address
}

export function getMulticallAddress(chainId: number): string {
  // Prefer Multicall3 where declared: some game deployments (Metis) lack `tryAggregate`.
  return getChain(chainId).multicall3 ?? requireContractAddress('multicall', chainId)
}
