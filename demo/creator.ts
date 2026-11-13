/**
 * Hero creator: pick every visual gene, the class and equipped gear, and see the hero animated
 * and as a still, in either art style. No RPC needed.
 */
import {
  APPENDAGE_COLORS,
  BACKGROUNDS,
  EQUIPMENT_DATA,
  EYE_COLORS,
  HAIR_COLORS,
  HERO_CLASSES,
  SKIN_COLORS,
  VISUAL_GENE_SLOTS,
  decodeVisualGenes,
  getAssetConfig,
  packGenes,
  renderClassicHero,
  type Equipment,
} from '../src'
import { HeroRenderer, getDefaultHeroAnimation, renderGeneratorHero, type HeroLookGear, type RenderableHero } from '../src/renderer'

type Table = Record<string, string>
const names = EQUIPMENT_DATA.names as unknown as {
  weapon: Record<string, Table>
  armor: Record<string, Table>
  accessory: Table
  offhand: Table
}
const weaponTypes = EQUIPMENT_DATA.weaponTypes as Table
const armorTypes = EQUIPMENT_DATA.armorTypes as Table

/** Gene ids the game uses for hair styles and appendages (both art styles have all of them). */
const STYLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 24, 25, 26, 28]
const DYES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const tier = (id: number) => (id < 16 ? `Basic ${id + 1}` : id < 24 ? `Advanced ${id - 15}` : id < 28 ? `Elite ${id - 23}` : 'Exalted 1')

interface Look {
  art: 'local' | 'generator'
  gender: number
  heroClass: number
  background: number
  skinColor: number
  hairStyle: number
  hairColor: number
  eyeColor: number
  headAppendage: number
  appendageColor: number
  backAppendage: number
  backAppendageColor: number
  /** `type:display`, or '' for none. */
  weapon: string
  /** Shield displayId, or ''. */
  offhand: string
  /** `type:display`, or ''. */
  armor: string
  /** displayId, or ''. */
  accessory: string
  dye1: number
  dye2: number
}

const keys = (t: object) => Object.keys(t).map(Number)
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

const WEAPONS = Object.entries(names.weapon).flatMap(([type, byId]) =>
  Object.entries(byId).map(([id, name]) => ({ value: `${type}:${id}`, label: `${weaponTypes[type]}: ${name}` }))
)
const ARMORS = Object.entries(names.armor).flatMap(([type, byId]) =>
  Object.entries(byId).map(([id, name]) => ({ value: `${type}:${id}`, label: `${armorTypes[type]}: ${name}` }))
)
const ACCESSORIES = Object.entries(names.accessory).map(([id, name]) => ({ value: id, label: name }))
const OFFHANDS = Object.entries(names.offhand).map(([id, name]) => ({ value: id, label: name }))

function randomLook(art: Look['art']): Look {
  const maybe = <T>(list: { value: T }[]) => (Math.random() < 0.6 ? pick(list).value : '')
  return {
    art,
    gender: pick([1, 3]),
    heroClass: pick(keys(HERO_CLASSES)),
    background: pick(keys(BACKGROUNDS)),
    skinColor: pick(keys(SKIN_COLORS)),
    hairStyle: pick(STYLES),
    hairColor: pick(keys(HAIR_COLORS)),
    eyeColor: pick(keys(EYE_COLORS)),
    headAppendage: pick(STYLES),
    appendageColor: pick(keys(APPENDAGE_COLORS)),
    backAppendage: pick(STYLES),
    backAppendageColor: pick(keys(APPENDAGE_COLORS)),
    weapon: maybe(WEAPONS) as string,
    offhand: maybe(OFFHANDS) as string,
    armor: maybe(ARMORS) as string,
    accessory: maybe(ACCESSORIES) as string,
    dye1: pick(DYES),
    dye2: pick(DYES),
  }
}

/** The hero these picks make: real visual genes, packed and decoded by the SDK. */
function heroOf(look: Look) {
  const allele = (n: number) => ({ d: n, r1: n, r2: n, r3: n })
  const raw = Object.fromEntries(VISUAL_GENE_SLOTS.map(slot => [slot, allele(0)])) as Record<(typeof VISUAL_GENE_SLOTS)[number], ReturnType<typeof allele>>
  for (const slot of [
    'gender',
    'background',
    'skinColor',
    'hairStyle',
    'hairColor',
    'eyeColor',
    'headAppendage',
    'appendageColor',
    'backAppendage',
    'backAppendageColor',
  ] as const)
    raw[slot] = allele(look[slot])
  const genes = packGenes(raw, VISUAL_GENE_SLOTS)
  const visualGenes = decodeVisualGenes(genes)
  const heroClass = HERO_CLASSES[look.heroClass as keyof typeof HERO_CLASSES]
  const hero: RenderableHero = { id: '0', chainId: 8217, gender: visualGenes.gender.d!, class: heroClass, visualGenes }
  return { hero, genes, visualGenes }
}

function gearOf(look: Look): HeroLookGear {
  const item = (kind: Equipment['kind'], typeId: number, displayId: number, dyes: [number, number] = [0, 0]) =>
    ({ kind, typeId, displayId, dyes }) as Equipment
  const pair = (v: string) => v.split(':').map(Number) as [number, number]
  return {
    weapon1: look.weapon ? item('weapon', ...pair(look.weapon)) : null,
    offhand1: look.offhand ? item('offhand', 2, Number(look.offhand)) : null,
    armor: look.armor ? item('armor', ...pair(look.armor)) : null,
    accessory: look.accessory ? item('accessory', 1, Number(look.accessory), [look.dye1, look.dye2]) : null,
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v)
    else if (k === 'style') node.setAttribute('style', String(v))
    else (node as unknown as Record<string, unknown>)[k] = v
  }
  node.append(...children)
  return node
}

export function mountCreator(root: HTMLElement): void {
  let look = randomLook('generator')
  let renderer: HeroRenderer | null = null
  let version = 0
  /** The animation picked in the list; until then, the hero's default for its weapon. */
  let chosen = ''

  const canvas = el('canvas', { class: 'creator-canvas', width: 360, height: 360 })
  const stage = el('div', { class: 'creator-stage' }, canvas)
  const portrait = el('img', { class: 'creator-portrait', alt: 'The hero standing still' })
  const animSelect = el('select', { class: 'creator-anim', 'aria-label': 'Animation' }) as HTMLSelectElement
  const replay = el('button', { type: 'button', textContent: 'Play once' })
  const genesOut = el('code', { class: 'creator-genes' })
  const status = el('div', { class: 'status' })
  const controls = el('form', { class: 'creator-controls panel' })

  // ---- controls
  type Field = keyof Look
  const inputs = new Map<Field, { get(): string; set(v: string): void }>()

  const row = (label: string, control: HTMLElement) => el('label', { class: 'creator-row' }, el('span', { class: 'creator-label', textContent: label }), control)
  const group = (title: string, ...rows: HTMLElement[]) => el('fieldset', { class: 'creator-group' }, el('legend', { textContent: title }), ...rows)

  function select(field: Field, options: { value: string | number; label: string }[], none?: string) {
    const s = el('select') as HTMLSelectElement
    if (none !== undefined) s.append(el('option', { value: '', textContent: none }))
    for (const o of options) s.append(el('option', { value: String(o.value), textContent: o.label }))
    s.onchange = () => update(field, s.value)
    inputs.set(field, { get: () => s.value, set: v => (s.value = v) })
    return s
  }

  function swatches(field: Field, table: Record<number, string>) {
    const box = el('div', { class: 'swatches', role: 'radiogroup' })
    const buttons = keys(table).map(id => {
      const b = el('button', { type: 'button', class: 'swatch', title: `#${table[id]}`, style: `background:#${table[id]}` }) as HTMLButtonElement
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-label', `#${table[id]}`)
      b.onclick = () => update(field, String(id))
      b.dataset.value = String(id)
      box.append(b)
      return b
    })
    inputs.set(field, {
      get: () => buttons.find(b => b.getAttribute('aria-checked') === 'true')?.dataset.value ?? '',
      set: v => buttons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === v))),
    })
    return box
  }

  const styleOptions = STYLES.map(id => ({ value: id, label: `${tier(id)} (#${id})` }))
  const randomize = el('button', { type: 'button', class: 'primary', textContent: 'Randomize' })
  randomize.onclick = () => {
    look = randomLook(look.art)
    sync()
    draw()
  }
  const randomizeLooks = el('button', { type: 'button', textContent: 'Randomize genes only' })
  randomizeLooks.onclick = () => {
    const r = randomLook(look.art)
    look = { ...r, heroClass: look.heroClass, weapon: look.weapon, offhand: look.offhand, armor: look.armor, accessory: look.accessory, dye1: look.dye1, dye2: look.dye2 }
    sync()
    draw()
  }

  controls.append(
    el('div', { class: 'creator-buttons' }, randomize, randomizeLooks),
    group(
      'Hero',
      row('Art', select('art', [
        { value: 'generator', label: 'Hero generator (armor & accessories)' },
        { value: 'local', label: 'Classic layers' },
      ])),
      row('Gender', select('gender', [
        { value: 1, label: 'Male' },
        { value: 3, label: 'Female' },
      ])),
      row('Class', select('heroClass', keys(HERO_CLASSES).map(id => ({ value: id, label: HERO_CLASSES[id as keyof typeof HERO_CLASSES] })))),
      row('Background', select('background', keys(BACKGROUNDS).map(id => ({ value: id, label: BACKGROUNDS[id as keyof typeof BACKGROUNDS] }))))
    ),
    group(
      'Body',
      row('Skin', swatches('skinColor', SKIN_COLORS)),
      row('Eyes', swatches('eyeColor', EYE_COLORS)),
      row('Hair style', select('hairStyle', styleOptions)),
      row('Hair color', swatches('hairColor', HAIR_COLORS))
    ),
    group(
      'Appendages',
      row('Head', select('headAppendage', styleOptions)),
      row('Head color', swatches('appendageColor', APPENDAGE_COLORS)),
      row('Back', select('backAppendage', styleOptions)),
      row('Back color', swatches('backAppendageColor', APPENDAGE_COLORS))
    ),
    group(
      'Gear',
      row('Weapon', select('weapon', WEAPONS, 'Class weapon')),
      row('Shield', select('offhand', OFFHANDS, 'None')),
      row('Armor', select('armor', ARMORS, 'Class clothing')),
      row('Accessory', select('accessory', ACCESSORIES, 'None')),
      row('Dyes', el('span', { class: 'creator-dyes' }, select('dye1', DYES.map(d => ({ value: d, label: `Dye ${d}` }))), select('dye2', DYES.map(d => ({ value: d, label: `Dye ${d}` }))))),
      el('p', { class: 'hint', textContent: 'Armor and accessories show with the hero generator art. A few items have no art; they keep the default look.' })
    )
  )

  animSelect.onchange = () => {
    chosen = animSelect.value
    renderer?.play(chosen).catch(() => {})
  }
  replay.onclick = () => animSelect.value && renderer?.playOnce(animSelect.value).catch(() => {})

  root.replaceChildren(
    el(
      'div',
      { class: 'creator' },
      el(
        'div',
        { class: 'creator-preview panel' },
        stage,
        el('div', { class: 'creator-anim-row' }, animSelect, replay),
        el('div', { class: 'creator-still' }, portrait, el('div', {}, el('div', { class: 'sub', textContent: 'Visual genes' }), genesOut)),
        status
      ),
      controls
    )
  )

  function update(field: Field, value: string) {
    look = { ...look, [field]: typeof look[field] === 'number' ? Number(value) : value }
    sync()
    draw()
  }

  /** Shows the picks in the controls. */
  function sync() {
    for (const [field, input] of inputs) input.set(String(look[field]))
  }

  async function draw() {
    const v = ++version
    const { hero, genes } = heroOf(look)
    const gear = gearOf(look)
    const assets = getAssetConfig()
    genesOut.textContent = genes.toString()
    const bg = BACKGROUNDS[look.background as keyof typeof BACKGROUNDS]
    stage.style.backgroundImage = `url("${assets.assetsBaseUrl}/hero-card/assets/images/hero/backgrounds/${bg === 'mountains' ? 'mountain.gif' : `${bg}.png`}")`
    status.textContent = 'Drawing…'
    status.className = 'status'

    const input = { class: hero.class, visualGenes: hero.visualGenes!, gear }
    const still = look.art === 'generator' ? renderGeneratorHero(input, { scale: 3 }) : renderClassicHero(input, { scale: 3 })
    still.then(c => v === version && (portrait.src = c.toDataURL())).catch(() => {})

    const animation = chosen || getDefaultHeroAnimation(hero, gear)
    const next = new HeroRenderer(canvas, hero, { source: look.art, gear, animation, zoom: 1.4 })
    try {
      await next.ready
    } catch (e) {
      next.destroy()
      if (v === version) {
        status.textContent = e instanceof Error ? e.message : String(e)
        status.className = 'status error'
      }
      return
    }
    if (v !== version) return next.destroy()
    renderer?.destroy()
    renderer = next
    status.textContent = ''
    if (!animSelect.options.length) {
      const all = [...next.animations].sort()
      for (const a of all) animSelect.append(el('option', { value: a, textContent: a }))
    }
    animSelect.value = animation
  }

  sync()
  draw()
}
