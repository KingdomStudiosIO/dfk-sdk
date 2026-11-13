import { getAssetConfig, type AssetConfig } from '../config'
import type { VisualGenes } from './genes'
import type { Hero } from './types'

/**
 * The game's "classic" hero art: every hero is a stack of 30x45 pixel-art SVG layers picked by
 * gene and tinted with the hero's colors. The manifest is generated from the game client's own
 * components (see scripts/sync-from-interface.mjs); the SVGs ship in `assets/hero-classic`.
 */

export type ClassicColorKey = 'skin' | 'hair' | 'eye' | 'appendage' | 'backAppendage'

export interface ClassicLayer {
  /** `color`, `shadow`, `highlight`, `clothing`, `undies` or `overlay`. */
  role: string
  /** SVG file in the classic part set. */
  src?: string
  /** For `src` layers drawn with `stroke="current"`: which hero color fills them. */
  color?: ClassicColorKey
  /** Inline color layers: a viewBox and pixel paths. */
  viewBox?: [number, number]
  paths?: { d: string; color?: ClassicColorKey; stroke?: string }[]
}

export interface ClassicPart {
  /** The client's part class, e.g. `heroArmRightTop`, `heroHairFront`, `headAppendage`. */
  part: string
  layers: ClassicLayer[]
}

export interface ClassicHeroManifest {
  classes: Record<'male' | 'female', Record<string, ClassicPart[]>>
  hair: Record<'male' | 'female', Record<number, ClassicPart[]>>
  headAppendage: Record<number, ClassicPart[]>
  backAppendage: Record<number, ClassicPart[]>
}

export type ClassicHeroInput = Pick<Hero, 'class'> & {
  visualGenes: Pick<
    VisualGenes,
    'gender' | 'hairStyle' | 'hairColor' | 'eyeColor' | 'skinColor' | 'headAppendage' | 'appendageColor' | 'backAppendage' | 'backAppendageColor'
  >
}

/** One drawable layer: an SVG document, its size, and where it sits in the 30x45 hero frame. */
export interface ResolvedClassicLayer {
  part: string
  role: string
  svg: string
  width: number
  height: number
  /** Position in the 30x45 frame (appendages and eyes are offset). */
  x: number
  y: number
  opacity: number
}

// Part placement and stacking, mirroring the client's classic hero stylesheet.
const PART_Z: Record<string, number> = {
  backAppendage: 1,
  heroBehind: 2,
  heroHairBack: 3,
  heroRightArm: 3,
  heroArmRightTop: 3,
  heroArmRightBtm: 3,
  heroLegRight: 3,
  heroLegRightBtm: 3,
  heroLegLeftBtm: 3,
  heroFootRight: 3,
  heroFootLeft: 3,
  heroLegLeft: 5,
  heroBody: 6,
  heroLeftArm: 6,
  heroArmLeftTop: 6,
  heroArmLeftBtm: 6,
  heroHead: 7,
  heroEyes: 8,
  heroHeadPiece: 9,
  heroHairFront: 10,
  headAppendage: 10,
}

/** Weapons are positioned per class by CSS in the game; they're left out of classic renders. */
const SKIPPED_PARTS = new Set(['heroWeapon', 'heroOffhand'])

function partOffset(part: string, gender: string): [number, number] {
  if (part === 'heroEyes') return [12, gender === 'male' ? 15 : 16]
  if (part === 'headAppendage') return [-9, gender === 'male' ? -1 : 0]
  if (part === 'backAppendage') return [-9, 0]
  return [0, 0]
}

/** Paint order of a layer inside its part (CSS z-index within the part's stacking context). */
function layerRank(part: string, role: string): number {
  if (part === 'heroHairFront' || part === 'heroHairBack') return role === 'color' ? 0 : 5
  if (part === 'heroEyes') return role === 'shadow' ? 1 : 0
  if (part === 'headAppendage' || part === 'backAppendage') return role === 'overlay' ? 1 : 0
  return { color: 0, shadow: 2, highlight: 3, undies: 5, clothing: 6 }[role] ?? 6
}

const layerOpacity = (part: string, role: string) =>
  role === 'highlight' && !['heroHairFront', 'heroHairBack', 'heroEyes'].includes(part) ? 0.4 : 1

let manifestPromise: Promise<ClassicHeroManifest> | undefined
/** The layer manifest is ~60 KB, so it's loaded on first use rather than bundled into every app. */
export function loadClassicHeroManifest(): Promise<ClassicHeroManifest> {
  return (manifestPromise ??= import('../generated/classic-hero').then(m => m.CLASSIC_HERO))
}

const partsCache = new Map<string, Promise<Record<string, string>>>()
/** The classic SVG layers (one JSON file, ~800 KB uncompressed, cached per asset base). */
export function loadClassicHeroParts(assets?: Partial<AssetConfig>): Promise<Record<string, string>> {
  const url = `${getAssetConfig(assets).assetsBaseUrl.replace(/\/$/, '')}/hero-classic/parts.json`
  let pending = partsCache.get(url)
  if (!pending) {
    pending = fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load classic hero parts ${url}: ${r.status}`)
      return r.json()
    })
    pending.catch(() => partsCache.delete(url))
    partsCache.set(url, pending)
  }
  return pending
}

const hex = (c: string | undefined) => `#${(c ?? '000000').replace(/^#/, '')}`

/**
 * Resolves a hero's classic layers, colored and in paint order. Pure data: pair it with
 * `loadClassicHeroParts` and any rasterizer, or use `renderClassicHero` / `HeroRenderer`.
 */
export function resolveClassicHeroLayers(
  hero: ClassicHeroInput,
  manifest: ClassicHeroManifest,
  svgs: Record<string, string>
): ResolvedClassicLayer[] {
  const g = hero.visualGenes
  const gender = g.gender.d === 'female' ? 'female' : 'male'
  const colors: Record<ClassicColorKey, string> = {
    skin: hex(g.skinColor.d),
    hair: hex(g.hairColor.d),
    eye: hex(g.eyeColor.d),
    appendage: hex(g.appendageColor.d),
    backAppendage: hex(g.backAppendageColor.d),
  }
  const parts = [
    ...(manifest.classes[gender][hero.class ?? 'warrior'] ?? manifest.classes[gender].warrior),
    ...(manifest.hair[gender][Number(g.hairStyle.d)] ?? []),
    ...(manifest.headAppendage[Number(g.headAppendage.d)] ?? []),
    ...(manifest.backAppendage[Number(g.backAppendage.d)] ?? []),
  ].filter(p => !SKIPPED_PARTS.has(p.part))

  const out: (ResolvedClassicLayer & { z: number; rank: number; order: number })[] = []
  parts.forEach((p, partIndex) => {
    const [x, y] = partOffset(p.part, gender)
    p.layers.forEach((layer, layerIndex) => {
      let svg: string | undefined
      let width = 30
      let height = 45
      if (layer.paths && layer.viewBox) {
        ;[width, height] = layer.viewBox
        const paths = layer.paths
          .map(path => `<path stroke="${path.color ? colors[path.color] : path.stroke ?? '#000'}" d="${path.d}"/>`)
          .join('')
        svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 ${width} ${height}" shape-rendering="crispEdges">${paths}</svg>`
      } else if (layer.src && svgs[layer.src]) {
        svg = svgs[layer.src]
        const vb = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg)
        if (vb) [width, height] = [Number(vb[1]), Number(vb[2])]
        if (layer.color) {
          // The game inlines these with the hero color on the root; `stroke="current"` inherits it.
          const color = colors[layer.color]
          svg = svg.replace(/stroke="current"/g, `stroke="${color}"`).replace('<svg ', `<svg stroke="${color}" `)
        }
      }
      if (!svg) return
      out.push({
        part: p.part,
        role: layer.role,
        svg,
        width,
        height,
        x,
        y,
        opacity: layerOpacity(p.part, layer.role),
        z: PART_Z[p.part] ?? 4,
        rank: layerRank(p.part, layer.role),
        order: partIndex * 100 + layerIndex,
      })
    })
  })
  // Parts at the same z paint in document order; layers inside a part by their own z.
  out.sort((a, b) => a.z - b.z || Math.floor(a.order / 100) - Math.floor(b.order / 100) || a.rank - b.rank || a.order - b.order)
  return out.map(({ z: _z, rank: _r, order: _o, ...layer }) => layer)
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
/** Rasterizes an SVG document through the browser's image decoder (cached). */
export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(svg)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to rasterize a classic hero layer'))
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
    pending.catch(() => imageCache.delete(svg))
    imageCache.set(svg, pending)
  }
  return pending
}

/** Draws resolved layers onto a 2D context with the frame's top-left at (`originX`, `originY`), 1px per pixel. */
export async function drawClassicLayers(
  ctx: CanvasRenderingContext2D,
  layers: readonly ResolvedClassicLayer[],
  originX: number,
  originY: number
): Promise<void> {
  const images = await Promise.all(layers.map(l => loadSvgImage(l.svg)))
  layers.forEach((l, i) => {
    ctx.globalAlpha = l.opacity
    ctx.drawImage(images[i], originX + l.x, originY + l.y, l.width, l.height)
  })
  ctx.globalAlpha = 1
}

/** Logical size of a classic render: the 30x45 frame plus room for wide appendages. */
export const CLASSIC_HERO_SIZE = { width: 59, height: 46, frameX: 9, frameY: 1 } as const

/**
 * Draws a hero in the game's classic pixel-art style onto a new canvas, entirely client-side.
 * `scale` multiplies the 59x46 logical size (the game shows heroes at 4x).
 */
export async function renderClassicHero(
  hero: ClassicHeroInput,
  { scale = 4, assets }: { scale?: number; assets?: Partial<AssetConfig> } = {}
): Promise<HTMLCanvasElement> {
  const [manifest, svgs] = await Promise.all([loadClassicHeroManifest(), loadClassicHeroParts(assets)])
  const layers = resolveClassicHeroLayers(hero, manifest, svgs)
  const base = document.createElement('canvas')
  base.width = CLASSIC_HERO_SIZE.width
  base.height = CLASSIC_HERO_SIZE.height
  await drawClassicLayers(base.getContext('2d')!, layers, CLASSIC_HERO_SIZE.frameX, CLASSIC_HERO_SIZE.frameY)
  if (scale === 1) return base
  const out = document.createElement('canvas')
  out.width = base.width * scale
  out.height = base.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(base, 0, 0, out.width, out.height)
  return out
}
