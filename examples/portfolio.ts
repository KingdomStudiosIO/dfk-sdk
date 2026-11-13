/**
 * Prints a wallet's heroes, items and tokens.
 *
 *   npx tsx examples/portfolio.ts 0xYourAddress [chainId]
 */
import { ChainId, createDFKClient, getCurrentStamina } from '../src'

const [owner, chainArg] = process.argv.slice(2)
if (!owner) {
  console.error('usage: portfolio.ts <address> [chainId]')
  process.exit(1)
}

const dfk = createDFKClient({ chainId: Number(chainArg ?? ChainId.KAIA_MAINNET) })

const [profile, heroes, items, tokens] = await Promise.all([
  dfk.profiles.get(owner),
  dfk.heroes.byOwner(owner),
  dfk.items.balances(owner),
  dfk.tokens.balances(owner, { includeZero: false }),
])

console.log(`${profile?.name ?? owner} on ${dfk.chain.name}\n`)

console.log(`Heroes (${heroes.length})`)
for (const h of heroes.sort((a, b) => b.level - a.level)) {
  const sale = h.sale ? ' [for sale]' : ''
  console.log(
    `  #${h.displayId.padEnd(8)} ${h.name.padEnd(24)} Lv${String(h.level).padEnd(3)} ${h.rarity.padEnd(10)} ${h.class}/${h.subClass}` +
      `  stamina ${getCurrentStamina(h)}/${h.stats.stamina}${sale}`
  )
}

console.log(`\nTokens`)
for (const t of tokens) console.log(`  ${t.token.symbol.padEnd(8)} ${t.formatted}`)

console.log(`\nItems (${items.length})`)
for (const b of items) console.log(`  ${b.item.name.padEnd(28)} ${b.formatted}`)
