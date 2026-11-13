import { getAssetConfig, type AssetConfig } from '../config'
import { renderClassicHero } from './classic'
import { STAT_ABBREVIATIONS, STAT_KEYS, type StatKey } from './constants'
import type { Alleles } from './genes'
import type { Hero } from './types'
import { getCurrentStamina } from './utils'

/**
 * The game's hero card: a two-sided card with the hero on its background scene, rarity frame,
 * vitals and bars on the front, and stat, growth and gene pages on the back. Rendered with the
 * game's own stylesheet (scoped, generated from the client) and the same markup.
 */

export type HeroCardPage = 'stats' | 'growth' | 'genes' | 'recessiveGenes' | 'recessiveVisualGenes' | 'history'

export const HERO_CARD_PAGES: readonly HeroCardPage[] = ['stats', 'growth', 'genes', 'recessiveGenes', 'recessiveVisualGenes', 'history']

const PAGE_META: Record<HeroCardPage, { label: string; icon: string }> = {
  stats: { label: 'stats', icon: 'stats' },
  growth: { label: 'growth', icon: 'growth' },
  genes: { label: 'genes', icon: 'genes' },
  recessiveGenes: { label: 'recessive genes', icon: 'recessive-genes' },
  recessiveVisualGenes: { label: 'recessive visual genes', icon: 'recessive-genes-2' },
  history: { label: 'summon history', icon: 'leveling' },
}

/** Mounts something into the card's portrait frame; may return a cleanup function. */
export type HeroCardPortrait = (frame: HTMLElement, hero: Hero) => void | (() => void)

export interface HeroCardOptions {
  /** Show the back (stats and genes). Default false. */
  flipped?: boolean
  /** Back page to show. Default `stats`. */
  page?: HeroCardPage
  /** Flip when the card is clicked (default true). */
  flipOnClick?: boolean
  /**
   * What fills the portrait frame: `classic` (default) draws the game's classic pixel-art hero;
   * pass a function to mount your own (the renderer entry's `createAnimatedHeroCard` mounts the
   * animated hero); `none` leaves just the background scene.
   */
  portrait?: 'classic' | 'none' | HeroCardPortrait
  /** Play the shiny effect for shiny heroes, as the game does on animated cards. Default true. */
  shinyEffect?: boolean
  /** Draw the ornate outer border the game uses in some views. Default false. */
  border?: boolean
  /** Owner name for the stats page ("Owned by"). The address comes from `hero.owner`. */
  ownerName?: string
  /** Load the game's fonts (Lora, Poppins) from Google Fonts. Default true. */
  loadFonts?: boolean
  assets?: Partial<AssetConfig>
  document?: Document
}

export interface HeroCardHandle {
  /** The card element (300x430, like the game). */
  element: HTMLElement
  /** Resolves once the stylesheet is in place and the portrait has been mounted. */
  ready: Promise<void>
  flip(flipped?: boolean): void
  readonly flipped: boolean
  setPage(page: HeroCardPage): void
  readonly page: HeroCardPage
  destroy(): void
}

// --------------------------------------------------------------- styles

const STYLE_ATTR = 'data-dfk-hero-card'
const styleLoads = new Map<string, Promise<void>>()

/** Injects the card stylesheet into a document once per asset base. Called by `createHeroCard`. */
export function ensureHeroCardStyles(
  { assets, loadFonts = true, document: doc = document }: { assets?: Partial<AssetConfig>; loadFonts?: boolean; document?: Document } = {}
): Promise<void> {
  const base = getAssetConfig(assets).assetsBaseUrl.replace(/\/$/, '')
  if (loadFonts && !doc.querySelector('link[data-dfk-fonts]')) {
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap'
    link.setAttribute('data-dfk-fonts', '')
    doc.head.append(link)
  }
  const key = `${base}|${doc === document ? 'main' : 'other'}`
  let pending = styleLoads.get(key)
  if (!pending || !doc.querySelector(`style[${STYLE_ATTR}="${base}"]`)) {
    pending = import('../generated/hero-card').then(({ HERO_CARD_CSS }) => {
      if (doc.querySelector(`style[${STYLE_ATTR}="${base}"]`)) return
      const style = doc.createElement('style')
      style.setAttribute(STYLE_ATTR, base)
      style.textContent = HERO_CARD_CSS.split('__DFK_ASSETS__').join(base)
      doc.head.append(style)
    })
    styleLoads.set(key, pending)
  }
  return pending
}

// --------------------------------------------------------------- helpers

// Class names: each of the game's stylesheets is scoped with its own prefix.
const c = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).map(n => `dfk-${n}`).join(' ')
const scoped =
  (prefix: string) =>
  (...names: (string | false | null | undefined)[]) =>
    names.filter(Boolean).map(n => `dfk-${prefix}-${n}`).join(' ')
const cn = scoped('n') // card container
const cc = scoped('c') // canvas portrait
const ce = scoped('e') // equipped icons
const sg = scoped('sg') // recessive gene grid
const sr = scoped('sr') // dominant gene rows
const pg = scoped('pg') // primary genes page and color badges
const rg = scoped('rg') // recessive genes page
const rv = scoped('rv') // recessive visual genes page
const lv = scoped('lv') // history page
const li = scoped('li') // history info block

type Child = Node | string | number | null | undefined | false

function make(doc: Document) {
  return function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: { class?: string; style?: string; [k: string]: string | undefined } = {},
    ...children: Child[]
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v)
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue
      node.append(typeof child === 'number' ? String(child) : child)
    }
    return node
  }
}

const GENE_RARITY_ABBR = (n: number) =>
  n === 99 ? 'B0' : n < 16 ? `B${n + 1}` : n < 24 ? `A${n - 15}` : n < 28 ? `E${n - 23}` : `X${n - 27}`
const GENE_RARITY_NAME = (n: number) =>
  n === 99 || n === -1 ? 'Basic0' : n < 16 ? `Basic${n + 1}` : n < 24 ? `Advanced${n - 15}` : n < 28 ? `Elite${n - 23}` : `Exalted${n - 27}`

/** Gene tier from a trait id, matching the game (skin colors past 14 are "limited"). */
export function getGeneRarity(traitId: number, isSkinColor = false): 'basic' | 'advanced' | 'elite' | 'exalted' | 'limited' {
  if (isSkinColor && traitId > 14) return 'limited'
  return traitId < 16 ? 'basic' : traitId < 24 ? 'advanced' : traitId < 28 ? 'elite' : 'exalted'
}

const STAT_LABELS: Record<StatKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  agility: 'Agility',
  vitality: 'Vitality',
  endurance: 'Endurance',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  luck: 'Luck',
}
// The card lists stats in this order.
const CARD_STATS: StatKey[] = ['strength', 'dexterity', 'agility', 'vitality', 'endurance', 'intelligence', 'wisdom', 'luck']

const PROFESSIONS = [
  ['mining', 'Mining', 'Strength & Endurance'],
  ['gardening', 'Gardening', 'Vitality & Wisdom'],
  ['fishing', 'Fishing', 'Agility & Luck'],
  ['foraging', 'Foraging', 'Dexterity & Intelligence'],
] as const

const CHEVRON = (points: string, doc: Document) => {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  line.setAttribute('points', points)
  svg.append(line)
  return svg
}

const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

// --------------------------------------------------------------- gene rows

interface GeneCell {
  value: string
  rarity: string
  traitId: number | null
}

const COLOR_GENES = new Set(['hairColor', 'appendageColor', 'backAppendageColor', 'eyeColor', 'skinColor'])

let geneNamesPromise: Promise<typeof import('../generated/gene-names').GENE_NAMES> | undefined
const loadGeneNames = () => (geneNamesPromise ??= import('../generated/gene-names').then(m => m.GENE_NAMES))
type GeneNames = Awaited<ReturnType<typeof loadGeneNames>>

function geneCell(
  names: GeneNames,
  key: string,
  label: unknown,
  raw: number,
  gender: string | undefined,
  dominant: boolean
): GeneCell {
  let value = String(label ?? '')
  if (key === 'class' && dominant) value = `-${value}`
  else if (COLOR_GENES.has(key)) value = `#${value}`.toUpperCase()
  else if (key === 'headAppendage') value = names.headAppendage[raw] ?? value
  else if (key === 'backAppendage') value = names.backAppendage[raw] ?? value
  else if (key === 'hairStyle' && gender) value = (names.hairStyle as Record<string, readonly string[]>)[gender]?.[raw] ?? value
  else if (key === 'active1' || key === 'active2') value = (names.active as Record<string, { label: string }>)[value]?.label ?? value
  else if (key === 'passive1' || key === 'passive2') value = (names.passive as Record<string, { label: string }>)[value]?.label ?? value

  // Tier rules from the game: class and ability genes, hair styles and appendages, and color
  // genes have tiers; text genes (profession, element, stat boosts, …) show as basic.
  let traitId: number | null = null
  if (['class', 'subClass', 'active1', 'active2', 'passive1', 'passive2', 'hairStyle', 'headAppendage', 'backAppendage', 'hairColor', 'appendageColor', 'backAppendageColor'].includes(key)) {
    traitId = raw
  } else if (key === 'eyeColor' || key === 'skinColor') {
    traitId = raw - 1
  }
  return { value, rarity: traitId === null ? 'basic' : getGeneRarity(traitId), traitId }
}

interface GeneRow {
  gene: string
  d: GeneCell
  r1: GeneCell
  r2: GeneCell
  r3: GeneCell
}

function geneRows(names: GeneNames, hero: Hero, keys: string[], withGender: boolean): GeneRow[] {
  const gender = withGender ? hero.visualGenes.gender.d : undefined
  const all = { ...hero.statGenes, ...hero.visualGenes } as unknown as Record<string, Alleles<unknown>>
  const raw = { ...hero.statGenes.raw, ...hero.visualGenes.raw } as unknown as Record<string, Alleles<number>>
  return keys
    .filter(k => all[k] && raw[k])
    .map(k => ({
      // The game labels the head appendage color by its full name.
      gene: k === 'appendageColor' ? 'headAppendageColor' : k,
      d: geneCell(names, k, all[k].d, raw[k].d, gender, true),
      r1: geneCell(names, k, all[k].r1, raw[k].r1, gender, false),
      r2: geneCell(names, k, all[k].r2, raw[k].r2, gender, false),
      r3: geneCell(names, k, all[k].r3, raw[k].r3, gender, false),
    }))
}

// --------------------------------------------------------------- card

/**
 * Builds the game's hero card for a hero. Framework-free: append `handle.element` anywhere.
 *
 * ```ts
 * const card = createHeroCard(hero)
 * document.body.append(card.element)
 * card.flip()                    // show stats and genes
 * card.setPage('genes')
 * ```
 */
export function createHeroCard(hero: Hero, options: HeroCardOptions = {}): HeroCardHandle {
  const doc = options.document ?? document
  const h = make(doc)
  const base = getAssetConfig(options.assets).assetsBaseUrl.replace(/\/$/, '')
  const img = (path: string) => `${base}/hero-card/${path}`
  const cleanups: (() => void)[] = []
  let flipped = options.flipped ?? false
  let page: HeroCardPage = options.page ?? 'stats'

  const container = h('div', { class: cn('heroCardContainer'), style: 'visibility:hidden' })
  const ready = Promise.all([ensureHeroCardStyles({ assets: options.assets, loadFonts: options.loadFonts, document: doc }), loadGeneNames(), import('../generated/hero-card')]).then(
    async ([, names, { HERO_CARD_IMAGES: icons }]) => {
      build(names, icons)
      container.style.visibility = ''
    }
  )

  let card: HTMLElement
  let backContent: HTMLElement
  let toggles: HTMLElement[] = []
  let names: GeneNames

  function build(geneNames: GeneNames, icons: typeof import('../generated/hero-card').HERO_CARD_IMAGES) {
    names = geneNames
    const background = hero.visualGenes.background.d ?? hero.background ?? 'plains'
    const gender = hero.gender ?? 'male'
    const shiny = options.shinyEffect !== false && hero.shiny

    const iconRow = () =>
      h(
        'div',
        { class: c('specials', 'row') },
        h('div', { class: c('icon') }, hero.element && h('img', { src: img(icons.element[hero.element as keyof typeof icons.element] ?? icons.element.fire), alt: '' }), h('span', { class: c('tooltip') }, hero.element ?? '')),
        h('div', { class: c('icon') }, h('img', { src: img(icons.background[background as keyof typeof icons.background] ?? icons.background.plains), alt: '' }), h('span', { class: c('tooltip') }, background)),
        h('div', { class: c('icon') }, h('img', { src: img(icons.gender[gender as 'male' | 'female']), alt: '' }), h('span', { class: c('tooltip') }, gender))
      )

    // ---- front
    const realmIcon = icons.realm[hero.originRealm as keyof typeof icons.realm] ?? icons.realm.serendale
    const heroFrame = h('div', { class: c(hero.class ?? 'warrior', gender, 'heroFrame', background) })
    const front = h(
      'div',
      { class: c('heroCardFront') },
      h(
        'button',
        { class: c('heroID'), type: 'button', title: hero.id },
        h('img', { class: c('cuteJewel'), src: img(realmIcon), style: `width:${hero.originRealm === 'serendale2' ? 16 : 10}px`, alt: '' }),
        ` #${hero.displayId}`
      ),
      h('div', { class: c('heroHealth') }, h('img', { src: img(icons.health), alt: '' }), hero.stats.hp, h('span', { class: c('tooltip') }, 'Health')),
      h('div', { class: c('heroMana') }, h('img', { src: img(icons.mana), alt: '' }), hero.stats.mp, h('span', { class: c('tooltip') }, 'Mana')),
      h(
        'div',
        { class: c('heroCardFrame') },
        iconRow(),
        h('div', { class: c('heroName') }, h('span', {}, hero.name)),
        h('div', { class: c('heroPreview') }, h('div', { class: c('heroGlow') }), h('span', { class: c(shiny && 'animate') }, heroFrame)),
        equippedIcons(icons),
        h(
          'div',
          { class: c('heroInfo') },
          h('div', { class: c('class') }, hero.class ?? '', h('span', { class: c('subClass') }, hero.subClass ?? '')),
          h('div', { class: c('cardRarity') }, h('div', { class: c('icon') }, h('img', { src: img(icons.rarity[hero.rarity]), alt: '' }), h('span', { class: c('tooltip') }, hero.rarity))),
          h('div', { class: c('level') }, `Level ${hero.level}`, h('span', { class: c('subClass') }, `Gen ${hero.generation}`))
        ),
        vitals()
      )
    )

    // ---- back
    backContent = h('div', { class: c('heroFrame') })
    const back = h('div', { class: c('heroCardBack') }, h('div', { class: c('heroCardFrame') }, iconRow(), h('div', { class: c('heroStats') }, backContent)))
    const step = (dir: number) => (e: Event) => {
      e.stopPropagation()
      const i = HERO_CARD_PAGES.indexOf(page)
      setPage(HERO_CARD_PAGES[(i + dir + HERO_CARD_PAGES.length) % HERO_CARD_PAGES.length])
    }
    const left = h('div', { class: c('sliderToggle', 'sliderLeft') }, CHEVRON('15 18 9 12 15 6', doc))
    const right = h('div', { class: c('sliderToggle', 'sliderRight') }, CHEVRON('9 18 15 12 9 6', doc))
    left.addEventListener('click', step(-1))
    right.addEventListener('click', step(1))
    toggles = HERO_CARD_PAGES.map(p => {
      const wrap = h(
        'div',
        { class: c('statsToggleButton') },
        h('div', { class: c('statsToggleButtonImage'), style: `background-image:url(${img(icons.pages[PAGE_META[p].icon as keyof typeof icons.pages])})` }, h('span', { class: cn('iconLetter') }, ' ')),
        h('span', { class: c('tooltip') }, PAGE_META[p].label)
      )
      wrap.addEventListener('click', e => {
        e.stopPropagation()
        setPage(p)
      })
      return wrap
    })
    back.append(left, right, h('div', { class: c('statsToggle') }, ...toggles))

    card = h(
      'div',
      { class: c('heroCard', shiny && 'animate', shiny && 'shiny', shiny && `shiny${hero.shinyStyle}`, hero.element, hero.rarity, flipped && 'flipped') },
      options.border ? h('img', { class: cn('heroBorder'), src: img(icons.border), alt: '' }) : null,
      front,
      back
    )
    if (options.flipOnClick !== false) card.addEventListener('click', () => flip())
    container.append(card)
    renderPage()
    mountPortrait(heroFrame)
  }

  function equippedIcons(icons: typeof import('../generated/hero-card').HERO_CARD_IMAGES) {
    const e = hero.equipment
    const slot = (name: keyof typeof icons.slots, id: string | null, visage: string | null) => {
      const state = id && visage ? 'active-visage' : visage ? 'inactive-visage' : id ? 'active' : 'inactive'
      return h('button', { type: 'button' }, h('img', { src: img(icons.slots[name][state]), alt: '' }))
    }
    return h(
      'div',
      { class: ce('equippedIcons') },
      h('div', { class: ce('leftColumn') }, slot('primary-hand', e.weapon1Id, e.weapon1VisageId), slot('secondary-hand', e.weapon2Id, e.weapon2VisageId), slot('armor', e.armorId, e.armorVisageId)),
      h('div', { class: ce('rightColumn') }, slot('primary-offhand', e.offhand1Id, e.offhand1VisageId), slot('secondary-offhand', e.offhand2Id, e.offhand2VisageId), slot('jewel', e.accessoryId, e.accessoryVisageId), slot('pet', e.petId, null))
    )
  }

  function vitals() {
    const summonPct = hero.generation === 0 ? 100 : hero.maxSummons === 0 ? 0 : ((hero.maxSummons - hero.summons) / hero.maxSummons) * 100
    const stamina = getCurrentStamina(hero)
    const staminaPct = hero.stats.stamina ? (stamina / hero.stats.stamina) * 100 : 0
    const xpPct = hero.xpToNextLevel ? (hero.xp / hero.xpToNextLevel) * 100 : 0
    const pct = (n: number) => `width:${Math.max(0, Math.min(100, n))}%`
    return h(
      'div',
      { class: c('heroStats') },
      h(
        'div',
        { class: c('heroFrame') },
        h(
          'div',
          { class: c('statSummons', 'row') },
          'Summons',
          h('div', { class: c('bar') }, h('div', { class: c('summonsBar'), style: pct(summonPct) })),
          h(
            'div',
            { class: c('summonsAmount', 'amount') },
            hero.generation === 0
              ? h('div', { style: 'display:flex;align-items:center' }, h('span', { style: 'font-size:8px' }, `${hero.summons}/`), h('span', { style: 'font-size:16px' }, '∞'))
              : `${hero.maxSummons - hero.summons}/${hero.maxSummons}`
          )
        ),
        h(
          'div',
          { class: c('statStamina', 'row') },
          'Stamina',
          h('div', { class: c('bar') }, h('div', { class: c('staminaBar', stamina < 0 && 'negativeStaminaBar'), style: pct(staminaPct) }, staminaPct < 100 ? h('div', { class: c('staminaLoading') }) : null)),
          h('div', { class: c('staminaAmount', 'amount') }, `${stamina}/${hero.stats.stamina}`)
        ),
        h(
          'div',
          { class: c('statXp', 'row') },
          'XP',
          h('div', { class: c('bar') }, h('div', { class: c('xpBar'), style: pct(xpPct) })),
          h('div', { class: c('xpAmount', 'amount') }, `${hero.xp}/${hero.xpToNextLevel}`)
        )
      )
    )
  }

  // ---- back pages
  const statName = (key: StatKey, boostPrimary: string) => {
    const abbr = STAT_ABBREVIATIONS[key]
    const b1 = hero.statGenes.statBoost1.d === abbr
    const b2 = hero.statGenes.statBoost2.d === abbr
    if (b1 && b2)
      return h('div', { class: c('statName') }, h('span', { class: c('statBoostDouble') }, abbr), h('span', { class: c('tooltip') }, STAT_LABELS[key], h('span', { class: c('statBoost') }, ' +2'), h('br'), h('span', { class: c('statBoost2') }, boostPrimary)))
    if (b1) return h('div', { class: c('statName') }, h('span', { class: c('statBoost') }, abbr), h('span', { class: c('tooltip') }, STAT_LABELS[key], h('span', { class: c('statBoost') }, ' +2')))
    if (b2) return h('div', { class: c('statName') }, h('span', { class: c('statBoost2') }, abbr), h('span', { class: c('tooltip') }, STAT_LABELS[key], h('br'), h('span', { class: c('statBoost2') }, boostPrimary)))
    return h('div', { class: c('statName') }, abbr, h('span', { class: c('tooltip') }, STAT_LABELS[key]))
  }

  function statsPage() {
    const score = STAT_KEYS.reduce((n, k) => n + hero.stats[k], 0)
    return [
      h(
        'div',
        { style: 'padding:0 10px' },
        h(
          'div',
          { class: c('col') },
          h('h3', { style: 'margin:0.5rem 0 0.75rem' }, 'Stats'),
          h('div', { class: c('statList') }, ...CARD_STATS.map(k => h('div', {}, statName(k, '+2 P%, +4 S%'), h('div', { class: c('statPoint') }, hero.stats[k])))),
          h('p', { class: c('statScore') }, `Stat Score: ${score}`)
        ),
        h(
          'div',
          { class: c('col') },
          h('h3', { style: 'margin:.25rem 0px 0.75rem' }, 'Gathering Professions'),
          h(
            'div',
            { class: c('skillList') },
            ...PROFESSIONS.flatMap(([key, label, statsText]) => {
              const chosen = hero.profession === key
              return [
                h('div', { class: c('skillName', chosen && 'chosen') }, label, h('span', { class: c('tooltip', 'professionTooltip') }, chosen ? h('span', { class: c('chosen') }, 'Main', h('br')) : null, statsText)),
                h('div', { class: c('skillLevel') }, hero.skills[key].toFixed(1)),
              ]
            })
          )
        )
      ),
      h(
        'div',
        { class: c('ownerInfo') },
        h('div', { class: c('heroOwner') }, `Owned by: ${options.ownerName ?? ''}`),
        hero.owner ? h('div', { class: c('heroHash') }, hero.owner) : null
      ),
    ]
  }

  function growthPage() {
    const list = (position: 'primary' | 'secondary') =>
      h(
        'div',
        { class: c('statList') },
        ...CARD_STATS.map(k => {
          const abbr = STAT_ABBREVIATIONS[k]
          const boosted = hero.statGenes.statBoost2.d === abbr
          const growth = position === 'primary' ? hero.primaryGrowth[k] : hero.secondaryGrowth[k]
          return h(
            'div',
            {},
            h('div', { class: c('statName') }, boosted ? h('span', { class: c('statBoost2') }, abbr) : abbr, boosted ? h('span', { class: c('tooltip', 'statBoost2') }, `+${position === 'primary' ? 2 : 4}%`) : null),
            h('div', { class: c('statPoint') }, `${growth / 100}%`)
          )
        })
      )
    return [
      h(
        'div',
        { style: 'padding:0 10px' },
        h('div', { class: c('col') }, h('h3', { style: 'margin:0.5rem 0 0.75rem' }, 'Primary Growth'), list('primary')),
        h('div', { class: c('col') }, h('h3', { style: 'margin:1rem 0px 0.75rem' }, 'Secondary Growth'), list('secondary'))
      ),
    ]
  }

  const colorBlock = (cell: GeneCell, mapping: string) => {
    // The game's color badge: tier abbreviation plus a swatch.
    const shifted = mapping === 'eyeColor' || mapping === 'skinColor'
    // Position in the game's color table (eye and skin trait ids are stored one lower).
    const index = (cell.traitId ?? 0) + (shifted ? 1 : 0)
    const n = shifted ? (index === 0 ? 99 : index - 1) : index
    const rarity = getGeneRarity(index, mapping === 'skinColor')
    const label = mapping === 'skinColor' && n > 14 && n < 99 ? `L${n + 1}` : GENE_RARITY_ABBR(n)
    return h('div', { class: pg('colorBlock') }, h('p', { class: pg('stats', rarity) }, label), h('div', { style: `background:${cell.value};width:12px;height:12px;border:2px solid white` }))
  }

  type Scope = typeof sg
  const valueTooltip = (s: Scope, cell: GeneCell, gene: string) =>
    cell.traitId === null
      ? h('span', { class: s('tooltip') }, cell.value)
      : h('span', { class: s('tooltip', 'tooltipExtended') }, cell.value, h('br'), gene === 'skinColor' && cell.traitId > 14 ? 'Limited' : GENE_RARITY_NAME(cell.traitId))

  const geneValue = (s: Scope, cell: GeneCell, gene: string) => {
    const content = cell.value.startsWith('#') ? colorBlock(cell, gene) : cell.value
    const cls = typeof content === 'string' && /^[a-z]\w*$/i.test(content) ? content : ''
    return h('div', { class: s('statBlock') }, h('p', { class: s('stats', cell.rarity, cls) }, content), valueTooltip(s, cell, gene))
  }

  /** One dominant gene per row (the "genes" page). */
  const statRows = (rows: GeneRow[]) =>
    rows.map(r => {
      const label = r.gene.split(/(?=[0-9,A-Z])/).join(' ').replace('Appendage Color', 'App. Color')
      return h('div', { class: sr('statRow') }, h('div', { class: sr('statBlock') }, h('p', { class: sr('stats', 'labelRow') }, label)), geneValue(sr, r.d, r.gene))
    })

  /** Three recessives per row (the recessive pages). */
  const statGrid = (rows: GeneRow[]) =>
    h(
      'div',
      { class: sg('statGrid') },
      ...rows.map(r => {
        const initials = r.gene.split(/(?=[0-9,A-Z])/).reduce((t, w) => t + w.charAt(0), '')
        return h(
          'div',
          { class: sg('statRow') },
          h('div', { class: sg('statBlock') }, h('p', { class: sg('stats', 'labelRow') }, initials), h('span', { class: sg('tooltip') }, r.gene)),
          geneValue(sg, r.r1, r.gene),
          geneValue(sg, r.r2, r.gene),
          geneValue(sg, r.r3, r.gene)
        )
      })
    )

  const VISUAL_KEYS = ['hairStyle', 'hairColor', 'headAppendage', 'appendageColor', 'backAppendage', 'backAppendageColor', 'skinColor', 'eyeColor']
  const STAT_GENE_KEYS = ['class', 'subClass', 'profession', 'element', 'statBoost1', 'statBoost2', 'active1', 'active2', 'passive1', 'passive2']

  function genesPage() {
    return [
      h(
        'div',
        { class: pg('heroPrimaryGenes') },
        h('h3', { class: pg('header') }, 'Ability Genes'),
        h('div', { class: pg('statGrid') }, ...statRows(geneRows(names, hero, ['active1', 'active2'], false)), h('hr', { class: pg('divider') }), ...statRows(geneRows(names, hero, ['passive1', 'passive2'], false))),
        h('h3', { class: pg('header') }, 'Visual Genes'),
        h('div', { class: pg('statGrid') }, ...statRows(geneRows(names, hero, VISUAL_KEYS, true)))
      ),
    ]
  }

  function recessivePage() {
    // Crafting genes are only shown in game once they're valid on chain, so they're left out.
    return [h('div', { class: rg('heroRecessiveGenes') }, h('h3', { class: rg('header') }, 'Recessive Genes'), statGrid(geneRows(names, hero, STAT_GENE_KEYS, false)))]
  }

  function recessiveVisualPage() {
    return [h('div', { class: rv('heroRecessiveVisualGenes') }, h('h3', { class: rv('header') }, 'Recessive Visual Genes'), statGrid(geneRows(names, hero, ['gender', 'background', ...VISUAL_KEYS], true)))]
  }

  function historyPage() {
    const known = hero.summonedAt.getTime() > 0
    return [
      h(
        'div',
        { class: lv('heroLeveling') },
        h('h3', { class: lv('header') }, 'Hero History'),
        h(
          'div',
          { class: lv('levelingContainer') },
          h(
            'div',
            { class: li('infoBlock') },
            h('h4', {}, 'Hero Summoned'),
            h('p', { class: li('date') }, known ? formatDate(hero.summonedAt) : 'Unknown'),
            hero.generation === 0
              ? h('p', { class: li('summonStoneText') }, 'Generation 0 hero')
              : h('p', { class: li('summonStoneText') }, `Summoner #${hero.summonerId}`, h('br'), `Assistant #${hero.assistantId}`),
            h('p', { class: li('summonStoneText') }, hero.maxSummons >= 11 ? 'Unlimited summons' : `${hero.summonsRemaining} of ${hero.maxSummons} summons left`)
          )
        )
      ),
    ]
  }

  function renderPage() {
    if (!backContent) return
    const content =
      page === 'stats' ? statsPage() : page === 'growth' ? growthPage() : page === 'genes' ? genesPage() : page === 'recessiveGenes' ? recessivePage() : page === 'recessiveVisualGenes' ? recessiveVisualPage() : historyPage()
    backContent.replaceChildren(...content)
    toggles.forEach((t, i) => {
      const image = t.firstElementChild as HTMLElement
      const active = HERO_CARD_PAGES[i] === page
      image.className = active ? c('statsToggleButtonImage', 'statsToggleButtonImageActive') : `${c('statsToggleButtonImage')} inactive`
      ;(image.firstElementChild as HTMLElement).className = active ? `${cn('iconLetter')} ${cn('iconLetterActive')}` : cn('iconLetter')
    })
  }

  function mountPortrait(frame: HTMLElement) {
    const portrait = options.portrait ?? 'classic'
    if (portrait === 'none') return
    if (portrait === 'classic') {
      renderClassicHero(hero, { scale: 4, assets: options.assets }).then(canvas => {
        canvas.className = `${cc('heroStaticImage')} ${cc('loaded')}`
        // Placed like the game's static portrait, feet on the scene's ground line.
        canvas.style.cssText = 'position:absolute;width:236px;bottom:-14px;left:50%;transform:translateX(-50%);z-index:1;image-rendering:pixelated'
        frame.append(canvas)
      })
      return
    }
    const cleanup = portrait(frame, hero)
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }

  function flip(next = !flipped) {
    flipped = next
    card?.classList.toggle(c('flipped'), flipped)
  }

  function setPage(next: HeroCardPage) {
    page = next
    renderPage()
  }

  return {
    element: container,
    ready,
    flip,
    get flipped() {
      return flipped
    },
    setPage,
    get page() {
      return page
    },
    destroy() {
      cleanups.forEach(f => f())
      container.remove()
    },
  }
}
