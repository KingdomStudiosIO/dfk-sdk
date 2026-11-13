import { getHeroRigBaseUrl, type AssetConfig } from '../config'
import type { HeroGear } from '../equipment/types'
import { RIG_EQUIPMENT } from '../generated/rig-equipment'
import { RIG_WEAPONS } from '../generated/rig-weapons'
import {
  loadClassicHeroManifest,
  loadClassicHeroParts,
  loadSvgImage,
  resolveClassicHeroLayers,
  type ClassicHeroInput,
  type ResolvedClassicLayer,
} from '../heroes/classic'
import { parseAtlas as parseRigAtlas, type RigAtlas } from './rig/atlas'

/**
 * Builds a hero's rig atlas in the browser, replacing the retired hero generator service.
 *
 * The rig ships with a complete default hero atlas (`hero-rig/skeleton.png`): every body part,
 * expression, hair and weapon in its own 64x64 cell. Those cells are the game's classic 30x45
 * pixel-art layers drawn at 1x, at a fixed offset per slot. So the hero's own classic layers are
 * painted into the same cells, keeping the default weapons and shadows.
 */

const CELL = 64

/** Where the 30x45 frame's top-left sits inside each cell, measured from the rig's default atlas. */
function frameOrigin(region: string, gender: 'male' | 'female'): [number, number] {
  const female = gender === 'female'
  if (/_Head|^Mask$|^HeadAppendage$/.test(region)) return female ? [18, 9] : [17, 10]
  if (region.startsWith('Hairs/')) return female ? [4, 9] : [3, 10]
  if (region === 'BackAppendage') return [13, 10]
  if (region === 'Behind') return [18, 11]
  return [17, 10]
}

// Classic part -> rig region. Skin layers go to the gendered skin, clothing to the overlay slot.
const LIMBS: Record<string, string> = {
  heroBody: 'Body',
  heroArmRightTop: 'RightArmTop',
  heroArmRightBtm: 'RightArmBtm',
  heroArmLeftTop: 'LeftArmTop',
  heroArmLeftBtm: 'LeftArmBtm',
  heroLegLeft: 'LeftLeg',
  heroLegLeftBtm: 'LeftLegBtm',
  heroLegRight: 'RightLeg',
  heroLegRightBtm: 'RightLegBtm',
  heroFootLeft: 'LeftFoot',
  heroFootRight: 'RightFoot',
}
const SINGLE: Record<string, string> = {
  heroBehind: 'Behind',
  heroHairFront: 'Hairs/Front',
  heroHairBack: 'Hairs/Back',
  headAppendage: 'HeadAppendage',
  backAppendage: 'BackAppendage',
  heroHeadPiece: 'Mask',
}
const HEAD_VARIANTS = ['_Head', '_Head_Angry', '_Head_EyesMid', '_Head_EyesClosed'] as const

/** Every region the builder repaints (both genders' skins, so nothing from the default hero leaks through). */
const REPAINTED = [
  ...Object.values(LIMBS),
  ...Object.values(SINGLE),
  ...['MALE/male', 'FEMALE/female'].flatMap(p => [...Object.values(LIMBS).map(l => `${p}_${l}`), ...HEAD_VARIANTS.map(v => `${p}${v}`)]),
]

/**
 * Weapon slots. The idle and action animations never swap attachments: they pose the weapon bone
 * for the class's weapon type and draw whatever art these cells hold, so each class needs its own
 * weapon art here (the hero generator did the same). Shields go in the offhand slot.
 */
const BOW_CLASSES = new Set(['archer', 'spellbow'])
const WEAPON_CELLS = { weapon: 'weapons/weapon1', shield: 'weapons/offhand1', bow: 'weapons/bow' } as const

/** Equipped items that change how a hero looks; pass what `dfk.equipment.forHero()` returns. */
/**
 * The equipped gear that changes how a hero looks. The classic layers (`source: 'local'`) show the
 * weapon and shield; the hero generator's art (`source: 'generator'`) also shows armor and
 * accessories. `dfk.equipment.forHero(hero)` returns all of it.
 */
export type HeroLookGear = Partial<
  Pick<HeroGear, 'weapon1' | 'weapon1Visage' | 'offhand1' | 'offhand1Visage' | 'armor' | 'armorVisage' | 'accessory' | 'accessoryVisage'>
>

type CellArt = Partial<Record<keyof typeof WEAPON_CELLS, string | null>>

/**
 * Art for the weapon cells from equipped gear, as the game shows it: the weapon's visage (or the
 * weapon) in the hand, bows in the bow cell, an equipped shield in the offhand, and no offhand
 * with a two-handed weapon. A string is a cell image, null an empty cell, and a missing key keeps
 * the class default. Items without rig art (a few the game has no image for) keep the default.
 */
export function gearCells(gear: HeroLookGear | null | undefined): CellArt {
  const cells: CellArt = {}
  const weapon = gear?.weapon1
  const look = gear?.weapon1Visage ?? weapon
  const file = look ? RIG_EQUIPMENT.weapons[look.typeId]?.[look.displayId] : undefined
  if (look && file) {
    if (RIG_EQUIPMENT.animationSets[look.typeId] === 'Bow') {
      cells.bow = file
      cells.weapon = null
    } else {
      cells.weapon = file
    }
  }
  const offhand = gear?.offhand1Visage ?? gear?.offhand1
  const shield = offhand ? RIG_EQUIPMENT.offhands[offhand.displayId] : undefined
  if (shield) cells.shield = shield
  if (weapon && RIG_EQUIPMENT.twoHanded.includes(weapon.typeId)) cells.shield = null
  return cells
}

/** Regions the skeleton references that the shipped atlas lacks; they get an empty cell. */
const MISSING_REGIONS = ['weapons/weapon2', 'weapons/Stool', 'weapons/Weight']
const PAD = 2

function regionsFor(layer: ResolvedClassicLayer, gender: 'male' | 'female'): string[] {
  const skin = gender === 'male' ? 'MALE/male' : 'FEMALE/female'
  if (layer.part === 'heroHead') return HEAD_VARIANTS.map(v => `${skin}${v}`)
  if (layer.part === 'heroEyes') return [`${skin}_Head`, `${skin}_Head_Angry`, `${skin}_Head_EyesMid`]
  const limb = LIMBS[layer.part]
  if (limb) {
    if (layer.role === 'clothing') return [limb]
    if (layer.role === 'undies') return [] // the rig has its own undies slot
    return [`${skin}_${limb}`]
  }
  const single = SINGLE[layer.part]
  return single ? [single] : []
}


const weaponImageCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = weaponImageCache.get(url)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load ${url}`))
      img.src = url
    })
    pending.catch(() => weaponImageCache.delete(url))
    weaponImageCache.set(url, pending)
  }
  return pending
}

const rigCache = new Map<string, Promise<{ image: HTMLImageElement; atlasText: string }>>()
function loadRig(assets?: Partial<AssetConfig>) {
  const base = getHeroRigBaseUrl(assets)
  let pending = rigCache.get(base)
  if (!pending) {
    pending = Promise.all([
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load ${base}/skeleton.png`))
        img.src = `${base}/skeleton.png`
      }),
      fetch(`${base}/skeleton.atlas`).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${base}/skeleton.atlas: ${r.status}`)
        return r.text()
      }),
    ]).then(([image, atlasText]) => ({ image, atlasText }))
    pending.catch(() => rigCache.delete(base))
    rigCache.set(base, pending)
  }
  return pending
}

type Bounds = [number, number, number, number]

function parseAtlas(atlasText: string): { page: string; header: string[]; regions: Map<string, Bounds> } {
  const lines = atlasText.split(/\r?\n/).filter(l => l.trim())
  const page = lines[0].trim()
  const header: string[] = []
  const regions = new Map<string, Bounds>()
  let name: string | undefined
  for (const line of lines.slice(1)) {
    if (!line.includes(':')) name = line.trim()
    else if (!name) header.push(line.trim())
    else if (line.trim().startsWith('bounds:')) regions.set(name, line.split(':')[1].split(',').map(Number) as Bounds)
  }
  return { page, header, regions }
}

/**
 * The shipped atlas packs identical (empty) images into one cell, so several slots share
 * bounds. Every region we paint gets its own cell in a strip appended below the texture.
 */
function layoutAtlas(baseText: string, width: number, height: number) {
  const { page, header, regions } = parseAtlas(baseText)
  const own = [...new Set([...REPAINTED, ...Object.values(WEAPON_CELLS), ...MISSING_REGIONS])]
  const perRow = Math.floor((width - PAD) / (CELL + PAD))
  const rows = Math.ceil(own.length / perRow)
  const newHeight = height + rows * (CELL + PAD) + PAD
  const sharedCells: Bounds[] = []
  const previous = new Map<string, Bounds>()
  own.forEach((name, i) => {
    const old = regions.get(name)
    if (old) {
      sharedCells.push(old)
      previous.set(name, old)
    }
    regions.set(name, [PAD + (i % perRow) * (CELL + PAD), height + PAD + Math.floor(i / perRow) * (CELL + PAD), CELL, CELL])
  })
  const text = [
    page,
    ...header.map(h => (h.startsWith('size:') ? `size:${width},${newHeight}` : h)),
    ...[...regions].map(([name, b]) => `${name}\nbounds:${b.join(',')}`),
  ].join('\n')
  return { text, regions, height: newHeight, sharedCells, previous }
}

/** The painted atlas texture and its region text (standard `.atlas` format, usable by other skeletal runtimes). */
export interface HeroAtlasImage {
  canvas: HTMLCanvasElement
  atlasText: string
}

/** A hero to paint: its class and genes, plus (optionally) the gear it has equipped. */
export type HeroAtlasInput = ClassicHeroInput & { gear?: HeroLookGear | null }

/** Paints a hero's classic layers (and equipped weapon and shield) into a copy of the rig's default atlas. */
export async function buildHeroAtlasImage(hero: HeroAtlasInput, assets?: Partial<AssetConfig>): Promise<HeroAtlasImage> {
  const [{ image, atlasText: baseText }, manifest, svgs] = await Promise.all([
    loadRig(assets),
    loadClassicHeroManifest(),
    loadClassicHeroParts(assets),
  ])
  const gender = hero.visualGenes.gender.d === 'female' ? 'female' : 'male'
  const layers = resolveClassicHeroLayers(hero, manifest, svgs)
  const layout = layoutAtlas(baseText, image.width, image.height)
  const bounds = layout.regions

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, 0, 0)
  // Weapon cells start from the default art (so classes without their own weapon keep the rig's),
  // then get the equipped gear or the class's weapon, shield and bow painted in.
  const classKey = (hero.class ?? 'warrior').toLowerCase()
  const art: CellArt = { ...RIG_WEAPONS[classKey], ...gearCells(hero.gear) }
  const weaponImages = await Promise.all(
    (Object.keys(WEAPON_CELLS) as (keyof typeof WEAPON_CELLS)[]).map(async kind => {
      const file = art[kind]
      return [kind, file ? await loadImage(`${getHeroRigBaseUrl(assets)}/${file}`) : file === null ? null : undefined] as const
    })
  )
  for (const [kind, img] of weaponImages) {
    const region = WEAPON_CELLS[kind]
    const to = bounds.get(region)!
    const from = layout.previous.get(region)
    if (img) ctx.drawImage(img, to[0], to[1], CELL, CELL)
    // null: deliberately empty (a bow in hand, or a two-handed weapon's free offhand).
    else if (img === null) continue
    // No class art: keep the rig's default (a sword and bow), except that bow classes hold only
    // their bow, and only shield classes carry an offhand.
    else if (from && kind !== 'shield' && !(kind === 'weapon' && BOW_CLASSES.has(classKey)))
      ctx.drawImage(image, from[0], from[1], from[2], from[3], to[0], to[1], from[2], from[3])
  }
  // Clear the default hero's art from the cells we moved out of (other slots may still point there).
  for (const b of layout.sharedCells) ctx.clearRect(b[0], b[1], b[2], b[3])

  const images = await Promise.all(layers.map(l => loadSvgImage(l.svg)))
  layers.forEach((layer, i) => {
    for (const region of regionsFor(layer, gender)) {
      const b = bounds.get(region)
      if (!b) continue
      const [ox, oy] = frameOrigin(region, gender)
      ctx.save()
      ctx.beginPath()
      // Half-closed eyes keep only the lower rows; closed eyes are a dark line (see below).
      if (layer.part === 'heroEyes' && region.endsWith('_EyesMid')) {
        ctx.rect(b[0], b[1] + oy + layer.y + 1, b[2], b[3])
      } else {
        ctx.rect(b[0], b[1], b[2], b[3])
      }
      ctx.clip()
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(images[i], b[0] + ox + layer.x, b[1] + oy + layer.y, layer.width, layer.height)
      ctx.restore()
    }
  })

  // Closed eyes: a dark line where the eyes sit, like the default rig's art.
  const eyes = layers.find(l => l.part === 'heroEyes')
  const closed = bounds.get(gender === 'male' ? 'MALE/male_Head_EyesClosed' : 'FEMALE/female_Head_EyesClosed')
  if (eyes && closed) {
    const [ox, oy] = frameOrigin('_Head', gender)
    ctx.fillStyle = 'rgba(32,28,45,0.85)'
    ctx.fillRect(closed[0] + ox + eyes.x, closed[1] + oy + eyes.y + 2, 2, 1)
    ctx.fillRect(closed[0] + ox + eyes.x + 3, closed[1] + oy + eyes.y + 2, 2, 1)
  }

  return { canvas, atlasText: layout.text }
}

/** The hero's atlas, ready for `HeroRenderer` (or `drawRig`). */
export async function buildHeroAtlas(hero: HeroAtlasInput, assets?: Partial<AssetConfig>): Promise<RigAtlas> {
  const { canvas, atlasText } = await buildHeroAtlasImage(hero, assets)
  return { pages: [canvas], regions: parseRigAtlas(atlasText).regions }
}
