/**
 * A wallet's hero roster and inventory in React.
 */
import { ChainId } from '@defikingdoms/game-sdk'
import { DFKProvider, HeroCard, ItemIcon, useHeroesByOwner, useItemBalances } from '@defikingdoms/game-sdk/react'

export function App({ address }: { address: string }) {
  return (
    <DFKProvider chainId={ChainId.KAIA_MAINNET}>
      <Roster address={address} />
      <Inventory address={address} />
    </DFKProvider>
  )
}

function Roster({ address }: { address: string }) {
  const { data: heroes, loading, error, refetch } = useHeroesByOwner(address)
  if (loading) return <p>Loading heroes…</p>
  if (error) return <button onClick={refetch}>Couldn’t load heroes. Retry</button>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {heroes?.map(hero => <HeroCard key={hero.id} hero={hero} animated />)}
    </div>
  )
}

function Inventory({ address }: { address: string }) {
  const { data: balances } = useItemBalances(address)
  return (
    <ul>
      {balances?.map(b => (
        <li key={b.item.key}>
          <ItemIcon item={b.item} size={24} /> {b.item.name} × {b.formatted}
        </li>
      ))}
    </ul>
  )
}
