/**
 * DFK Game SDK demo. Framework-free: every section is plain DOM driven by the SDK.
 * Run with `npm run demo`.
 */
import { providers } from 'ethers'
import {
  CHAINS,
  ChainId,
  PET_CATALOG,
  PET_EGG_TYPES,
  PetRenderer,
  STAT_ABBREVIATIONS,
  STAT_KEYS,
  configureAssets,
  createDFKClient,
  formatAmount,
  getCurrentStamina,
  getExplorerLink,
  getPowerToken,
  HERO_CARD_PAGES,
  type HeroCardPage,
  renderClassicHero,
  createHeroCard,
  type DFKClient,
  type DFKWriter,
  type Equipment,
  type Hero,
  type HeroGear,
  type MarketName,
  type Pet,
  type PetAppearance,
  type PetBonus,
} from '../src'
import { mountCreator } from './creator'
import { HERO_ANIMATIONS, createAnimatedHeroCard, getDefaultHeroAnimation, professionAnimation, type HeroRenderer } from '../src/renderer'

// ---------------------------------------------------------------- setup

configureAssets({ assetsBaseUrl: new URL('dist/assets', location.href).href })

/** Chains with something to show, and a sample hero/wallet on each. */
const DEMO_CHAINS: { id: ChainId; hero?: string; wallet?: string }[] = [
  { id: ChainId.KAIA_MAINNET, hero: '2000000000001', wallet: '0xb1C37aA242F3Eb1f799E8B8e65ac339e5E2c5Be6' },
  // No native mints on C-Chain yet; hero #1 was migrated from Serendale.
  { id: ChainId.AVALANCHE_MAINNET, hero: '1' },
  { id: ChainId.METIS_MAINNET, hero: '1000000010863', wallet: '0xA8fE7b0DeACE5cEECb90c0cEd2020257997FE758' },
  { id: ChainId.KAIA_TESTNET },
]

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

let dfk: DFKClient
let chainId: ChainId

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: cls, ...rest } = props
  if (cls) node.className = cls
  Object.assign(node, rest)
  for (const c of children) if (c) node.append(c)
  return node
}

function status(target: HTMLElement, text: string, error = false) {
  target.replaceChildren(h('div', { class: `status${error ? ' error' : ''}`, textContent: text }))
}

const errorText = (e: unknown) => (e instanceof Error ? e.message.split(' (')[0] : String(e))
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')
const powerSymbol = () => getPowerToken(chainId)?.symbol ?? 'power token'
const price = (raw: bigint) => `${formatAmount(raw, 18, { maxFractionDigits: 2 })} ${powerSymbol()}`
const addressLink = (a?: string) =>
  a ? h('a', { href: getExplorerLink(chainId, a), target: '_blank', rel: 'noopener', textContent: short(a) }) : '—'

function useChain(id: ChainId, rpcUrl?: string) {
  chainId = id
  dfk = createDFKClient({ chainId: id, rpcUrl: rpcUrl || undefined })
  const sample = DEMO_CHAINS.find(c => c.id === id)
  $<HTMLInputElement>('hero-id').value = sample?.hero ?? ''
  $<HTMLInputElement>('wallet-address').value = sample?.wallet ?? ''
  for (const out of ['hero-out', 'wallet-out', 'market-out']) $(out).replaceChildren()
  writer = undefined
  renderActions()
}

// ---------------------------------------------------------------- tabs

function showTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)))
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${name}`))
  if (name === 'catalog' && !$('catalog-out').childElementCount) renderCatalog()
  if (name === 'creator' && !$('creator-out').childElementCount) mountCreator($('creator-out'))
  history.replaceState(null, '', `#${name}`)
}

// ---------------------------------------------------------------- hero tab

let heroCard: ReturnType<typeof createAnimatedHeroCard> | undefined
const petRenderers = new Set<PetRenderer>()

function destroyPetRenderers() {
  petRenderers.forEach(r => r.destroy())
  petRenderers.clear()
}

async function loadHero(id: string) {
  const out = $('hero-out')
  status(out, `Loading hero ${id}…`)
  heroCard?.destroy()
  try {
    const hero = await dfk.heroes.get(id)
    if (!hero) return status(out, `No hero ${id} on ${dfk.chain.name}.`, true)

    // The game's hero card, with the animated hero; click it to flip to stats and genes.
    // Fetch the gear first so the animated hero holds its equipped weapon and shield.
    const gearPromise = dfk.equipment.forHero(hero)
    const gear = await gearPromise.catch(() => null)
    const source = $<HTMLSelectElement>('hero-art').value as 'local' | 'generator'
    heroCard = createAnimatedHeroCard(hero, { renderer: { gear, source } })
    const card = heroCard
    const pageSelect = h(
      'select',
      { onchange: (e: Event) => card.setPage((e.target as HTMLSelectElement).value as HeroCardPage) },
      ...HERO_CARD_PAGES.map(p => h('option', { value: p, textContent: p.replace(/([A-Z])/g, ' $1').toLowerCase() }))
    )
    const cardControls = h(
      'div',
      { class: 'chips' },
      h('button', { type: 'button', textContent: 'Flip card', onclick: () => card.flip() }),
      pageSelect
    )
    const anims = h('div', { class: 'chips' })
    const classicBox = h('div', { class: 'classic' })
    const left = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'card-stage' }, card.element),
      cardControls,
      h('div', { class: 'title', textContent: hero.name }),
      h('div', {
        class: `sub rarity-${hero.rarity}`,
        textContent: `${hero.shiny ? '✦ ' : ''}${hero.rarity} · gen ${hero.generation} · #${hero.displayId}`,
      }),
      h('div', { class: 'sub', textContent: `Lv ${hero.level} ${hero.class ?? '?'} / ${hero.subClass ?? '?'}` }),
      h('div', { class: 'sub', textContent: [hero.element, hero.profession, hero.originRealm].filter(Boolean).join(' · ') }),
      h('div', { class: 'muted' }, 'Owner ', addressLink(hero.owner), ' ', viewWalletLink(hero.owner)),
      hero.sale ? h('div', { class: 'muted', textContent: `Listed for ${price(hero.sale.startingPrice)}` }) : null,
      hero.incomplete ? h('div', { class: 'muted', textContent: 'Genes unavailable from the Metis indexer.' }) : null,
      anims,
      h('h3', { class: 'spaced', textContent: 'Classic view' }),
      classicBox
    )
    // The game's classic pixel-art view, drawn client-side from genes.
    renderClassicHero(hero, { scale: 3 }).then(
      c => classicBox.replaceChildren(c),
      e => classicBox.replaceChildren(h('span', { class: 'muted', textContent: errorText(e) }))
    )

    const stats = h('div', { class: 'kv' })
    for (const key of STAT_KEYS) stats.append(kv(STAT_ABBREVIATIONS[key], hero.stats[key]))
    stats.append(
      kv('HP', hero.stats.hp),
      kv('MP', hero.stats.mp),
      kv('Stamina', `${getCurrentStamina(hero)} / ${hero.stats.stamina}`),
      kv('XP', `${hero.xp} / ${hero.xpToNextLevel}`),
      kv('Summons', hero.maxSummons >= 11 ? '∞' : `${hero.summonsRemaining} left`),
      ...(['mining', 'gardening', 'fishing', 'foraging'] as const).map(p => kv(p, hero.skills[p].toFixed(1)))
    )

    const gearBox = h('div', { class: 'gear' }, h('div', { class: 'status', textContent: 'Loading gear…' }))
    const petBox = h('div', {}, h('div', { class: 'status', textContent: hero.equipment.petId ? 'Loading pet…' : 'No pet bonded.' }))

    out.replaceChildren(
      h(
        'div',
        { class: 'hero-layout' },
        h('div', { class: 'stack' }, left, h('div', { class: 'panel' }, h('h3', { textContent: 'Pet' }), petBox)),
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'panel' }, h('h3', { textContent: 'Stats' }), stats),
          h('div', { class: 'panel' }, h('h3', { textContent: 'Equipment' }), gearBox),
          h('div', { class: 'panel' }, h('h3', { textContent: 'Genes' }), genesTable(hero))
        )
      )
    )

    // Animation controls drive the card's hero renderer.
    const renderer: HeroRenderer = await card.renderer
    renderer.ready.then(
      () => {
        const buttons: [string, () => void][] = [
          ['Idle', () => renderer.play(getDefaultHeroAnimation(hero, gear))],
          ['Walk', () => renderer.play(HERO_ANIMATIONS.overworldWalk)],
          ['Talk', () => renderer.play(HERO_ANIMATIONS.overworldTalk)],
          ['Hurt', () => renderer.playOnce(HERO_ANIMATIONS.hurt)],
          ['Shout', () => renderer.playOnce(HERO_ANIMATIONS.shout)],
          ['Train', () => renderer.play(HERO_ANIMATIONS.training)],
          ...(['mining', 'gardening', 'fishing', 'foraging'] as const).map(
            p => [p[0].toUpperCase() + p.slice(1), () => renderer.play(professionAnimation(p))] as [string, () => void]
          ),
        ]
        anims.replaceChildren(...buttons.map(([label, fn]) => h('button', { type: 'button', textContent: label, onclick: fn })))
      },
      e => {
        anims.replaceChildren(h('span', { class: 'muted', textContent: errorText(e) }))
      }
    )

    gearPromise
      .then(gear => renderGear(gearBox, gear))
      .catch(e => status(gearBox, errorText(e), true))

    if (hero.equipment.petId) {
      dfk.pets
        .get(hero.equipment.petId)
        .then(pet => petBox.replaceChildren(pet ? petCard(pet, 'large') : h('span', { class: 'muted', textContent: 'Pet not found.' })))
        .catch(e => status(petBox, errorText(e), true))
    }
  } catch (e) {
    status(out, errorText(e), true)
  }
}

function kv(label: string, value: string | number) {
  return h('div', {}, h('span', { textContent: label }), h('b', { textContent: String(value) }))
}

function viewWalletLink(owner?: string) {
  if (!owner) return null
  return h('a', {
    href: '#wallet',
    textContent: 'view wallet',
    onclick: (e: Event) => {
      e.preventDefault()
      $<HTMLInputElement>('wallet-address').value = owner
      showTab('wallet')
      loadWallet(owner)
    },
  })
}

function genesTable(hero: Hero) {
  const rows: HTMLTableRowElement[] = []
  const add = (group: string, genes: object) => {
    for (const [trait, a] of Object.entries(genes)) {
      if (trait === 'raw') continue
      const alleles = a as { d: unknown; r1: unknown; r2: unknown; r3: unknown }
      rows.push(
        h(
          'tr',
          {},
          h('td', { class: 'muted', textContent: group }),
          h('td', { textContent: trait }),
          ...[alleles.d, alleles.r1, alleles.r2, alleles.r3].map(v => h('td', { textContent: String(v ?? '—') }))
        )
      )
    }
  }
  add('stat', hero.statGenes)
  add('visual', hero.visualGenes)
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...['', 'Trait', 'Dominant', 'R1', 'R2', 'R3'].map(t => h('th', { textContent: t })))),
      h('tbody', {}, ...rows)
    )
  )
}

const GEAR_SLOTS: [keyof HeroGear, string][] = [
  ['weapon1', 'Main hand'],
  ['weapon2', 'Second weapon'],
  ['offhand1', 'Offhand'],
  ['offhand2', 'Second offhand'],
  ['armor', 'Armor'],
  ['accessory', 'Accessory'],
]

function renderGear(box: HTMLElement, gear: HeroGear) {
  const items = GEAR_SLOTS.filter(([slot]) => gear[slot]).map(([slot, label]) => {
    const visage = gear[`${slot}Visage` as keyof HeroGear]
    return gearItem(gear[slot]!, label, visage)
  })
  box.replaceChildren(...(items.length ? items : [h('span', { class: 'muted', textContent: 'Nothing equipped.' })]))
}

function gearItem(item: Equipment, label?: string, visage?: Equipment | null) {
  const lines = [...item.bonuses, ...item.enchantments].map(b => h('li', { textContent: b.text }))
  if (item.weapon) lines.unshift(h('li', { textContent: `Base damage ${item.weapon.baseDamage}, ${item.weapon.physicalScaling.map(s => `${s.stat} ${s.value}`).join(', ') || 'no scaling'}` }))
  if (item.armor) lines.unshift(h('li', { textContent: `Defense ${item.armor.physicalDefense} phys / ${item.armor.magicalDefense} magic, evasion ${item.armor.evasion}` }))
  return h(
    'div',
    { class: 'gear-item' },
    h('img', { src: item.image, alt: item.name, loading: 'lazy', onerror: hideBrokenImage }),
    h(
      'div',
      {},
      label ? h('div', { class: 'slot', textContent: label }) : null,
      h('div', {}, h('b', { textContent: item.name }), ' ', h('span', { class: `rarity-${item.rarity}`, textContent: item.rarity })),
      h('div', { class: 'muted', textContent: `${item.typeName} · durability ${item.durability}/${item.maxDurability}${item.sale ? ` · listed ${price(item.sale.startingPrice)}` : ''}` }),
      visage ? h('div', { class: 'muted', textContent: `Shown as ${visage.name}` }) : null,
      lines.length ? h('ul', {}, ...lines) : null
    )
  )
}

function hideBrokenImage(this: HTMLImageElement) {
  this.style.visibility = 'hidden'
}

// ---------------------------------------------------------------- pets

function bonusLine(b: PetBonus | null) {
  if (!b) return null
  const label = b.revealed ? b.name : `Unrevealed ${b.kind}`
  return h('div', { class: 'bonus' }, h('span', { textContent: label }), h('span', { class: 'muted', textContent: '★'.repeat(b.tier) }))
}

/** A pet card with a lazily started sprite animation. */
function petCard(pet: Pet, size: 'small' | 'large' = 'small') {
  const canvas = h('canvas')
  const card = h(
    'div',
    { class: 'card' },
    canvas,
    h('div', { class: 'name', textContent: pet.name, title: pet.name }),
    h('div', { class: `meta rarity-${pet.rarity}`, textContent: `${pet.shiny ? '✦ ' : ''}${pet.rarity} · #${pet.displayId}` }),
    h('div', { class: 'meta', textContent: `${pet.element} · ${pet.profession}${size === 'large' ? ` · ${pet.background}` : ''}` }),
    bonusLine(pet.gathering),
    bonusLine(pet.crafting),
    bonusLine(pet.combat),
    pet.sale ? h('div', { class: 'meta', textContent: `Listed ${price(pet.sale.startingPrice)}` }) : null
  )
  if (size === 'large') card.style.maxWidth = '260px'
  animateWhenVisible(canvas, () => (pet.species ? new PetRenderer(canvas, pet, { scene: true }) : undefined))
  return card
}

/** Starts a renderer when its canvas scrolls into view and stops it when it leaves. */
function animateWhenVisible(canvas: HTMLCanvasElement, create: () => PetRenderer | undefined) {
  let renderer: PetRenderer | undefined
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !renderer) {
      renderer = create()
      if (renderer) petRenderers.add(renderer)
      renderer?.ready.catch(() => canvas.replaceWith(h('div', { class: 'muted', textContent: 'No sprite' })))
    } else if (!entry.isIntersecting && renderer) {
      renderer.destroy()
      petRenderers.delete(renderer)
      renderer = undefined
    }
  })
  observer.observe(canvas)
}

// ---------------------------------------------------------------- wallet tab

async function loadWallet(address: string) {
  const out = $('wallet-out')
  destroyPetRenderers()
  status(out, `Loading ${short(address)}…`)
  const section = (title: string, note: string) => {
    const body = h('div', {}, h('div', { class: 'status', textContent: 'Loading…' }))
    out.append(h('h2', { class: 'section-title' }, title, h('span', { class: 'hint', textContent: note })), body)
    return body
  }
  out.replaceChildren()
  const profileBox = h('div', { class: 'muted' })
  out.append(profileBox)
  dfk.profiles.get(address).then(p => (profileBox.textContent = p ? `Profile: ${p.name}` : 'No on-chain profile'), () => {})

  const tokensBox = section('Tokens', 'dfk.tokens.balances')
  const heroesBox = section('Heroes', 'dfk.heroes.byOwner')
  const petsBox = section('Pets', 'dfk.pets.byOwner')
  const gearBox = section('Equipment', 'dfk.equipment.byOwner')
  const itemsBox = section('Items', 'dfk.items.balances')

  const settle = <T>(box: HTMLElement, p: Promise<T>, render: (v: T) => Node[]) =>
    p.then(
      v => {
        const nodes = render(v)
        box.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'muted', textContent: 'None.' })]))
      },
      e => status(box, errorText(e), true)
    )

  settle(tokensBox, dfk.tokens.balances(address, { includeZero: false }), balances => [
    h(
      'div',
      { class: 'items' },
      ...balances.map(b =>
        h('div', {}, h('img', { src: b.token.logo, alt: '', onerror: hideBrokenImage }), h('span', { textContent: `${formatAmount(b.raw, b.token.decimals, { maxFractionDigits: 3 })} ${b.token.symbol}` }))
      )
    ),
  ])

  // Wallet heroes as the game's cards: click a card to flip it, or open the hero.
  settle(heroesBox, dfk.heroes.byOwner(address), heroes =>
    heroes.length
      ? [
          h(
            'div',
            { class: 'card-grid' },
            ...heroes.slice(0, 24).map(hero =>
              h(
                'div',
                { class: 'card-cell' },
                createHeroCard(hero).element,
                h('div', { class: 'chips' },
                  h('button', {
                    type: 'button',
                    textContent: 'Open hero',
                    onclick: () => {
                      $<HTMLInputElement>('hero-id').value = hero.id
                      showTab('hero')
                      loadHero(hero.id)
                    },
                  }),
                  hero.sale ? h('span', { class: 'muted', textContent: `Listed ${price(hero.sale.startingPrice)}` }) : null
                )
              )
            )
          ),
          heroes.length > 24 ? h('div', { class: 'muted', textContent: `…and ${heroes.length - 24} more` }) : null,
        ].filter(Boolean) as Node[]
      : []
  )

  settle(petsBox, dfk.pets.byOwner(address), pets => (pets.length ? [h('div', { class: 'grid pets' }, ...pets.slice(0, 60).map(p => petCard(p)))] : []))

  settle(gearBox, dfk.equipment.byOwner(address), gear =>
    gear.length ? [h('div', { class: 'gear' }, ...gear.slice(0, 40).map(item => gearItem(item, item.kind)))] : []
  )

  settle(itemsBox, dfk.items.balances(address), items => [
    h(
      'div',
      { class: 'items' },
      ...items.map(b =>
        h(
          'div',
          { title: b.item.description },
          h('img', { src: dfk.items.imageUrl(b.item), alt: '', loading: 'lazy', onerror: hideBrokenImage }),
          h('span', { textContent: `${b.formatted} × ${b.item.name}` })
        )
      )
    ),
  ])
}

// ---------------------------------------------------------------- market tab

async function loadMarket(market: MarketName, kind: 'listings' | 'sales', lookbackBlocks: number) {
  const out = $('market-out')
  status(out, `Scanning the last ${lookbackBlocks.toLocaleString()} blocks of ${market} auction logs…`)
  try {
    if (kind === 'listings') {
      const listings = await dfk.market.recentListings(market, { lookbackBlocks })
      if (!listings.length) return status(out, 'No open listings created in this window. Try looking further back.')
      out.replaceChildren(
        table(
          ['Token', 'Price now', 'Start → end', 'Seller', 'Listed'],
          listings.map(l => [
            tokenLink(market, l.tokenId),
            price(l.currentPrice),
            `${price(l.startingPrice)} → ${price(l.endingPrice)}`,
            addressLink(l.seller),
            l.startedAt.toLocaleString(),
          ])
        )
      )
    } else {
      const sales = await dfk.market.recentSales(market, { lookbackBlocks })
      if (!sales.length) return status(out, 'No sales in this window. Try looking further back.')
      out.replaceChildren(
        table(
          ['Token', 'Price', 'Buyer', 'When', 'Tx'],
          sales.map(s => [
            tokenLink(market, s.tokenId),
            price(s.price),
            addressLink(s.buyer),
            s.timestamp?.toLocaleString() ?? `block ${s.blockNumber}`,
            h('a', { href: getExplorerLink(chainId, s.transactionHash, 'tx'), target: '_blank', rel: 'noopener', textContent: short(s.transactionHash) }),
          ])
        )
      )
    }
  } catch (e) {
    status(out, `${errorText(e)}. Public RPCs limit log queries; try a smaller window or your own RPC.`, true)
  }
}

function tokenLink(market: MarketName, id: string): Node {
  if (market !== 'heroes') return document.createTextNode(id)
  return h('a', {
    href: '#hero',
    textContent: id,
    onclick: (e: Event) => {
      e.preventDefault()
      $<HTMLInputElement>('hero-id').value = id
      showTab('hero')
      loadHero(id)
    },
  })
}

function table(headers: string[], rows: (Node | string)[][]) {
  return h(
    'div',
    { class: 'panel table-wrap' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...headers.map(t => h('th', { textContent: t })))),
      h('tbody', {}, ...rows.map(r => h('tr', {}, ...r.map(c => h('td', {}, c)))))
    )
  )
}

// ---------------------------------------------------------------- catalog tab

function renderCatalog() {
  const out = $('catalog-out')
  destroyPetRenderers()
  const egg = $<HTMLSelectElement>('catalog-egg').value
  const query = $<HTMLInputElement>('catalog-search').value.trim().toLowerCase()
  const scene = $<HTMLInputElement>('catalog-scene').checked
  const appearances = PET_CATALOG.appearances as unknown as Record<number, PetAppearance>[]

  const cards: HTMLElement[] = []
  appearances.forEach((species, eggIndex) => {
    if (egg !== '' && Number(egg) !== eggIndex) return
    for (const [id, s] of Object.entries(species)) {
      if (query && !`${s.name} ${s.family} ${s.variant}`.toLowerCase().includes(query)) continue
      const rarity = (['common', 'uncommon', 'rare', 'legendary', 'mythic'] as const)[s.rarity] ?? 'common'
      const canvas = h('canvas')
      cards.push(
        h(
          'div',
          { class: 'card' },
          canvas,
          h('div', { class: 'name', textContent: s.name }),
          h('div', { class: `meta rarity-${rarity}`, textContent: `${rarity} · ${s.variant}` }),
          h('div', { class: 'meta', textContent: `${s.family} · ${PET_EGG_TYPES[eggIndex]} #${id}` })
        )
      )
      // Background 0 (Stillwood Meadow) and the species' own rarity frame the sprite like a card.
      animateWhenVisible(canvas, () => new PetRenderer(canvas, { species: s, rarity, backgroundId: Number(id) % 11, element: 'fire' }, { scene }))
    }
  })
  out.replaceChildren(...(cards.length ? cards : [h('div', { class: 'muted', textContent: 'No species match.' })]))
}

// ---------------------------------------------------------------- actions tab

let writer: DFKWriter | undefined

function renderActions() {
  const box = $('actions')
  const connected = Boolean(writer)
  const form = (title: string, note: string, fields: [string, string][], run: (v: Record<string, string>) => Promise<{ hash: string; wait(): Promise<unknown> }>) => {
    const inputs = fields.map(([name, placeholder]) => h('input', { name, placeholder, required: true, spellcheck: false }))
    const button = h('button', { textContent: title, disabled: !connected, class: 'primary' })
    return h(
      'form',
      {
        class: 'panel',
        onsubmit: async (e: Event) => {
          e.preventDefault()
          const values = Object.fromEntries(inputs.map(i => [i.name, i.value.trim()]))
          button.disabled = true
          log(`${title}…`)
          try {
            const tx = await run(values)
            log(`sent ${tx.hash}`)
            await tx.wait()
            log(`${title}: confirmed`, 'ok')
          } catch (err) {
            log(`${title}: ${errorText(err)}`, 'err')
          } finally {
            button.disabled = false
          }
        },
      },
      h('h4', { textContent: title }),
      h('p', { textContent: note }),
      ...inputs,
      button
    )
  }

  box.replaceChildren(
    form('Send hero', 'writer.heroes.transfer', [['id', 'Hero id'], ['to', 'Recipient 0x…']], v => writer!.heroes.transfer(v.id, v.to)),
    form('List hero', `writer.heroes.list (fixed price in ${powerSymbol()}; approves the auction if needed)`, [['id', 'Hero id'], ['price', 'Price, e.g. 25']], v =>
      writer!.heroes.list(v.id, { startPrice: v.price })
    ),
    form('Cancel hero listing', 'writer.heroes.cancelListing', [['id', 'Hero id']], v => writer!.heroes.cancelListing(v.id)),
    form('Buy hero', `writer.heroes.buy (approves ${powerSymbol()} if needed)`, [['id', 'Hero id']], v => writer!.heroes.buy(v.id)),
    form('Send pet', 'writer.pets.transfer', [['id', 'Pet id'], ['to', 'Recipient 0x…']], v => writer!.pets.transfer(v.id, v.to)),
    form('Complete quest', 'writer.quests.complete', [['id', 'Hero id on a quest']], v => writer!.quests.complete(v.id))
  )
}

function log(text: string, kind?: 'ok' | 'err') {
  $('action-log').prepend(h('div', { class: kind ?? '', textContent: `${new Date().toLocaleTimeString()}  ${text}` }))
}

async function connectWallet() {
  const ethereum = (window as unknown as { ethereum?: providers.ExternalProvider }).ethereum
  if (!ethereum) return log('No browser wallet found. Install one (e.g. MetaMask) to try write actions.', 'err')
  try {
    const web3 = new providers.Web3Provider(ethereum, 'any')
    await web3.send('eth_requestAccounts', [])
    const network = await web3.getNetwork()
    if (network.chainId !== chainId) {
      try {
        await web3.send('wallet_switchEthereumChain', [{ chainId: `0x${chainId.toString(16)}` }])
      } catch {
        return log(`Switch your wallet to ${CHAINS[chainId].name} (chain id ${chainId}) and connect again.`, 'err')
      }
    }
    const signer = new providers.Web3Provider(ethereum, 'any').getSigner()
    writer = dfk.connect(signer)
    $('account').textContent = `Connected ${short(await signer.getAddress())} on ${CHAINS[chainId].name}`
    renderActions()
  } catch (e) {
    log(errorText(e), 'err')
  }
}

// ---------------------------------------------------------------- wire up

function init() {
  const select = $<HTMLSelectElement>('chain')
  for (const c of DEMO_CHAINS) select.append(h('option', { value: String(c.id), textContent: `${CHAINS[c.id].name} (${c.id})` }))

  $('chain-form').onsubmit = e => {
    e.preventDefault()
    useChain(Number(select.value), $<HTMLInputElement>('rpc').value.trim())
  }
  select.onchange = () => useChain(Number(select.value), $<HTMLInputElement>('rpc').value.trim())

  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach(b => (b.onclick = () => showTab(b.dataset.tab!)))

  $('hero-art').onchange = () => loadHero($<HTMLInputElement>('hero-id').value.trim())
  $('hero-form').onsubmit = e => {
    e.preventDefault()
    const id = $<HTMLInputElement>('hero-id').value.trim()
    if (id) loadHero(id)
  }
  $('wallet-form').onsubmit = e => {
    e.preventDefault()
    const address = $<HTMLInputElement>('wallet-address').value.trim()
    if (address) loadWallet(address)
  }
  $('market-form').onsubmit = (e: SubmitEvent) => {
    e.preventDefault()
    const kind = ((e.submitter as HTMLButtonElement | null)?.value ?? 'listings') as 'listings' | 'sales'
    loadMarket($<HTMLSelectElement>('market').value as MarketName, kind, Number($<HTMLInputElement>('lookback').value) || 20000)
  }
  let timer: number | undefined
  $('catalog-form').oninput = () => {
    clearTimeout(timer)
    timer = window.setTimeout(renderCatalog, 200)
  }
  $('catalog-form').onsubmit = e => e.preventDefault()
  $('connect').onclick = connectWallet

  useChain(DEMO_CHAINS[0].id)
  showTab(location.hash.slice(1) || 'hero')
  if (location.hash.slice(1) === '' || location.hash === '#hero') loadHero($<HTMLInputElement>('hero-id').value)
}

init()
