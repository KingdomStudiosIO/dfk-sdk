import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createDFKClient, type DFKClient, type DFKClientOptions } from '../client'

const DFKContext = createContext<DFKClient | null>(null)

export type DFKProviderProps = { children?: ReactNode } & ({ client: DFKClient } | (DFKClientOptions & { client?: undefined }))

/**
 * Supplies a DFK client to the hooks and components below it. Pass either a prebuilt
 * `client`, or client options (`chainId`, and optionally `provider` / `rpcUrl` / `assets`).
 */
export function DFKProvider(props: DFKProviderProps) {
  const options: Partial<DFKClientOptions> = props.client ? {} : props
  const { chainId, provider, rpcUrl, assets } = options
  // `assets` is compared by value so an inline object doesn't rebuild the client every render.
  const assetsKey = JSON.stringify(assets ?? null)
  const client = useMemo(
    () => props.client ?? createDFKClient({ chainId: chainId!, provider, rpcUrl, assets }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.client, chainId, provider, rpcUrl, assetsKey]
  )
  return <DFKContext.Provider value={client}>{props.children}</DFKContext.Provider>
}

export function useDFK(): DFKClient {
  const client = useContext(DFKContext)
  if (!client) throw new Error('useDFK must be used inside <DFKProvider>')
  return client
}
