/**
 * HeroRenderer in Node, against a recording 2D context: every drawImage is logged with the full
 * transform it's drawn under, so two identical logs mean identical pixels. Images whose pixels
 * matter (the atlas page, attachment copies) carry a pixel function or buffer.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeVisualGenes, getHeroRigUrl, getHeroSkeletonUrl } from '../src'
import { HeroRenderer, type HeroPose, type HeroRendererOptions, type RenderableHero } from '../src/renderer'
import { absoluteUrl, loadBakedRig } from '../src/renderer/rig/baked'
import { parseAtlas, type RigAtlas } from '../src/renderer/rig/atlas'
import { extractRegion } from '../src/renderer/rig/draw'

const ASSETS = path.join(__dirname, '../assets')
const PNG_SIZE = (file: string) => {
  const buf = fs.readFileSync(file)
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
}

type Matrix = [number, number, number, number, number, number]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

interface Pixels {
  label: string
  width: number
  height: number
  pixel(x: number, y: number): number
}

interface DrawOp {
  image: string
  args: number[]
  matrix: number[]
}

class MockContext {
  ops: DrawOp[] = []
  matrix: Matrix = [1, 0, 0, 1, 0, 0]
  private stack: Matrix[] = []
  imageSmoothingEnabled = true
  globalAlpha = 1
  fillStyle = ''
  constructor(private readonly canvas: MockCanvas) {}
  setTransform(...m: Matrix) {
    this.matrix = m
  }
  transform(...m: Matrix) {
    this.matrix = mul(this.matrix, m)
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y)
  }
  rotate(r: number) {
    this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0)
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0)
  }
  save() {
    this.stack.push(this.matrix)
  }
  restore() {
    this.matrix = this.stack.pop() ?? [1, 0, 0, 1, 0, 0]
  }
  clearRect(x: number, y: number, w: number, h: number) {
    // Clearing the whole canvas starts a new frame.
    if (x === 0 && y === 0 && w >= this.canvas.width && h >= this.canvas.height) {
      this.ops = []
      this.canvas.buffer.fill(0)
    }
  }
  drawImage(image: Pixels, ...args: number[]) {
    this.ops.push({ image: image.label, args, matrix: this.matrix.map(v => Math.round(v * 1e6) / 1e6) })
    // Pixel copies: a 1:1 sub-rectangle under the identity transform.
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args
    const identity = this.matrix.every((v, i) => v === [1, 0, 0, 1, 0, 0][i])
    if (args.length === 8 && identity && sw === dw && sh === dh) {
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) this.canvas.set(dx + i, dy + j, image.pixel(sx + i, sy + j))
    }
  }
  beginPath() {}
  rect() {}
  clip() {}
  fillRect() {}
}

let canvasCount = 0
class MockCanvas implements Pixels {
  label = `canvas${++canvasCount}`
  clientWidth = 0
  clientHeight = 0
  buffer = new Uint32Array(0)
  private w = 0
  private h = 0
  private readonly context = new MockContext(this)
  constructor(width = 0, height = 0) {
    this.width = width
    this.height = height
  }
  get width() {
    return this.w
  }
  set width(v: number) {
    this.w = v
    this.buffer = new Uint32Array(this.w * this.h)
  }
  get height() {
    return this.h
  }
  set height(v: number) {
    this.h = v
    this.buffer = new Uint32Array(this.w * this.h)
  }
  getContext() {
    return this.context
  }
  get ops() {
    return this.context.ops
  }
  set(x: number, y: number, v: number) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buffer[y * this.w + x] = v
  }
  pixel(x: number, y: number) {
    return this.buffer[y * this.w + x]
  }
}

/** The atlas page's made-up pixels: distinct per position, never transparent. */
const pagePixel = (x: number, y: number) => (0xff000000 | (x * 2654435761 + y * 40503)) >>> 0

let imageSources: string[] = []
class FakeImage implements Pixels {
  crossOrigin = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  label = ''
  width = 0
  height = 0
  pixel = pagePixel
  set src(url: string) {
    imageSources.push(url)
    this.label = url.startsWith('data:') ? 'svg' : url.split('/').pop()!
    ;[this.width, this.height] = url.endsWith('skeleton.png') ? PNG_SIZE(path.join(ASSETS, 'hero-rig/skeleton.png')) : [64, 64]
    setTimeout(() => this.onload?.())
  }
}

let fetched: string[] = []
async function fakeFetch(url: string) {
  fetched.push(url)
  const rig = /\/hero-rig\/(.+)$/.exec(url)
  const file = rig
    ? path.join(ASSETS, 'hero-rig', rig[1])
    : url.endsWith('/hero-classic/parts.json')
      ? path.join(ASSETS, 'hero-classic/parts.json')
      : ''
  const ok = !!file && fs.existsSync(file)
  const text = ok ? fs.readFileSync(file, 'utf8') : ''
  return { ok, status: ok ? 200 : 404, text: async () => text, json: async () => JSON.parse(text) }
}

beforeEach(() => {
  fetched = []
  imageSources = []
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('document', { baseURI: 'https://game.example/play/', createElement: () => new MockCanvas() })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const MALE: RenderableHero = { id: '1', chainId: 8217, gender: 'male', class: 'warrior' }
const ASSET_BASE = 'https://cdn.example/assets'
const WALK = 'GENERIC/Walk'
const HURT = 'GENERIC/Hurt'
const HEAD = 30 // the Head slot; male_Head sits at (1652, 2) in the rig atlas
const isHead = (op: DrawOp) => op.image === 'skeleton.png' && op.args[0] === 1652 && op.args[1] === 2

/** The rig's own atlas (a complete default hero) over a page of made-up pixels. */
function rigAtlas(): RigAtlas {
  const [width, height] = PNG_SIZE(path.join(ASSETS, 'hero-rig/skeleton.png'))
  const page: Pixels = { label: 'skeleton.png', width, height, pixel: pagePixel }
  return { pages: [page as unknown as HTMLImageElement], regions: parseAtlas(fs.readFileSync(path.join(ASSETS, 'hero-rig/skeleton.atlas'), 'utf8')).regions }
}

async function renderer(options: HeroRendererOptions = {}, hero = MALE) {
  const canvas = new MockCanvas(200, 300)
  const r = new HeroRenderer(canvas as unknown as HTMLCanvasElement, hero, {
    atlas: rigAtlas(),
    autoplay: false,
    mix: 0,
    assets: { assetsBaseUrl: ASSET_BASE },
    ...options,
  })
  await r.ready
  return { r, canvas }
}

describe('HeroRenderer.duration', () => {
  it('reads animation lengths from rig.json', async () => {
    const canvas = new MockCanvas(200, 300)
    const early = new HeroRenderer(canvas as unknown as HTMLCanvasElement, MALE, { atlas: rigAtlas(), autoplay: false, assets: { assetsBaseUrl: ASSET_BASE } })
    expect(early.duration(WALK)).toBe(0)
    await early.ready
    const rig = JSON.parse(fs.readFileSync(path.join(ASSETS, 'hero-rig/baked/rig.json'), 'utf8'))
    expect(early.duration(WALK)).toBe(rig.animations.find((a: { name: string }) => a.name === WALK).duration)
    expect(early.duration(WALK)).toBeGreaterThan(0)
    expect(early.duration('NOPE')).toBe(0)
  })
})

describe('HeroRenderer.renderAt', () => {
  it('draws what play() then tick() draws at the same time', async () => {
    const still = await renderer()
    const played = await renderer()
    await still.r.preload(WALK, HURT)

    still.r.renderAt(WALK, 0.73)
    await played.r.play(WALK)
    played.r.tick(0.73)
    expect(still.canvas.ops.length).toBeGreaterThan(10)
    expect(still.canvas.ops).toEqual(played.canvas.ops)

    // One-shots clamp to their end.
    still.r.renderAt(HURT, 99, { loop: false })
    await played.r.play(HURT, { loop: false })
    played.r.tick(99)
    expect(still.canvas.ops).toEqual(played.canvas.ops)
  })

  it('wraps looping animations and clamps one-shots', async () => {
    const { r, canvas } = await renderer()
    await r.preload(WALK, HURT)
    const d = r.duration(WALK)
    r.renderAt(WALK, 0.25)
    const base = canvas.ops
    r.renderAt(WALK, 2 * d + 0.25)
    expect(canvas.ops).toEqual(base)
    r.renderAt(WALK, 0.25 - d)
    expect(canvas.ops).toEqual(base)

    r.renderAt(HURT, -1, { loop: false })
    const start = canvas.ops
    r.renderAt(HURT, 0, { loop: false })
    expect(canvas.ops).toEqual(start)
  })

  it('leaves the player alone and fires no events', async () => {
    const events: string[] = []
    const a = await renderer({ onEvent: e => events.push(e.name) })
    const b = await renderer()
    const attack = 'CLASS/Warrior/1H Cast' // keys a `hit` event
    await a.r.preload(attack)
    await a.r.play(WALK)
    await b.r.play(WALK)
    a.r.tick(0.3)
    b.r.tick(0.3)
    for (let t = 0; t <= a.r.duration(attack) + 0.1; t += 1 / 60) a.r.renderAt(attack, t, { loop: false })
    a.r.tick(0.2)
    b.r.tick(0.2)
    expect(a.canvas.ops).toEqual(b.canvas.ops)
    expect(a.r.animation).toBe(WALK)
    expect(events).toEqual([])
  })

  it('needs the animation loaded first', async () => {
    // A base no other test uses, so nothing is loaded yet.
    const { r } = await renderer({ assets: { assetsBaseUrl: 'https://fresh.example/assets' } })
    expect(() => r.renderAt(HURT, 0)).toThrow(/preload/)
    expect(() => r.renderAt('NOPE', 0)).toThrow(/Unknown hero animation/)
  })
})

describe('onPose', () => {
  it('hides, reorders and replaces slots for one frame only', async () => {
    const base = await renderer()
    await base.r.preload(WALK)
    base.r.renderAt(WALK, 0.5)
    const baseline = base.canvas.ops
    expect(baseline.filter(isHead)).toHaveLength(1)

    let edit: (pose: HeroPose) => void = () => {}
    const seen: HeroPose[] = []
    const hooked = await renderer({ onPose: pose => (seen.push(pose), edit(pose)) })
    await hooked.r.preload(WALK)
    const draw = () => {
      hooked.r.renderAt(WALK, 0.5)
      return hooked.canvas.ops
    }

    expect(draw()).toEqual(baseline)
    expect(seen[0].slots[HEAD]).toBe('Head')
    expect(seen[0].images.every(i => i === null)).toBe(true)

    edit = pose => (pose.attachments[HEAD] = null)
    expect(draw()).toEqual(baseline.filter(op => !isHead(op)))

    edit = pose => pose.drawOrder.reverse()
    expect(draw()).toEqual([...baseline].reverse())

    const marker = new MockCanvas(64, 64)
    edit = pose => (pose.images[HEAD] = marker as unknown as HTMLCanvasElement)
    const replaced = draw()
    expect(replaced.filter(isHead)).toHaveLength(0)
    expect(replaced.filter(op => op.image === marker.label)).toHaveLength(1)
    expect(replaced).toHaveLength(baseline.length)

    // Nothing carries over: not to the next frame, the player's frames, or another renderer.
    edit = () => {}
    expect(draw()).toEqual(baseline)
    expect(seen[seen.length - 1].images.every(i => i === null)).toBe(true)
    await hooked.r.play(WALK)
    hooked.r.tick(0.5)
    expect(hooked.canvas.ops).toEqual(baseline)
    const other = await renderer()
    await other.r.play(WALK)
    other.r.tick(0.5)
    expect(other.canvas.ops).toEqual(baseline)
    const rig = await loadBakedRig(getHeroRigUrl({ assetsBaseUrl: ASSET_BASE }))
    expect(rig.slots[HEAD].attachment).toBe('head')
  })

  it('is called by tick() too', async () => {
    const onPose = vi.fn()
    const { r } = await renderer({ onPose })
    r.tick(0.1)
    expect(onPose).toHaveBeenCalledTimes(1)
  })

  it('draws a picture in the place of the attachment it replaces', async () => {
    const base = await renderer()
    await base.r.preload(WALK)
    base.r.renderAt(WALK, 0.5)
    const head = base.canvas.ops.find(isHead)!
    const swapped = await renderer({ onPose: p => (p.images[HEAD] = picture as unknown as HTMLCanvasElement) })
    const picture = swapped.r.attachmentImage('Head')!
    await swapped.r.preload(WALK)
    swapped.r.renderAt(WALK, 0.5)
    const op = swapped.canvas.ops.find(o => o.image === (picture as unknown as MockCanvas).label)!
    // Map both images' corners to the canvas: the full 64x64 frame lands in the same place.
    const corner = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
    const same = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 3))
    const [, , , , dx, dy, w, h] = head.args
    same(corner(op.matrix, op.args[0], op.args[1]), corner(head.matrix, dx, dy))
    same(corner(op.matrix, op.args[0] + op.args[2], op.args[1] + op.args[3]), corner(head.matrix, dx + w, dy + h))
  })
})

describe('HeroRenderer.attachmentImage', () => {
  it("copies the attachment's pixels from the hero's atlas", async () => {
    const { r } = await renderer()
    const head = r.attachmentImage('Head') as unknown as MockCanvas
    expect([head.width, head.height]).toEqual([64, 64])
    for (const [x, y] of [[0, 0], [10, 20], [63, 63]]) expect(head.pixel(x, y)).toBe(pagePixel(1652 + x, 2 + y))
    expect((r.attachmentImage('Head', 'head') as unknown as MockCanvas).buffer).toEqual(head.buffer)
    expect(r.attachmentImage('NoSuchSlot')).toBeNull()
    expect(r.attachmentImage('Head', 'no-such-attachment')).toBeNull()
  })

  it('puts trimmed regions back at their original size', () => {
    const page = { label: 'page', width: 64, height: 64, pixel: pagePixel }
    const region = { page: 0, x: 2, y: 4, width: 10, height: 12, originalWidth: 16, originalHeight: 16, offsetX: 3, offsetY: 1 }
    const out = extractRegion({ pages: [page as unknown as HTMLImageElement], regions: new Map() }, region, new MockCanvas() as unknown as HTMLCanvasElement) as unknown as MockCanvas
    expect([out.width, out.height]).toEqual([16, 16])
    // Offset 1 from the bottom: rows 3..14 from the top.
    expect(out.pixel(3, 3)).toBe(pagePixel(2, 4))
    expect(out.pixel(12, 14)).toBe(pagePixel(11, 15))
    expect(out.pixel(2, 3)).toBe(0)
    expect(out.pixel(3, 15)).toBe(0)
  })
})

describe('asset URLs', () => {
  it('loads from a relative asset base', async () => {
    const { r } = await renderer({ assets: { assetsBaseUrl: '/rel-assets' } })
    await r.preload(HURT)
    expect(fetched).toContain('/rel-assets/hero-rig/baked/rig.json')
    expect(fetched.some(u => u.startsWith('https://game.example/rel-assets/hero-rig/baked/anims/'))).toBe(true)
  })

  it('says why outside a browser', () => {
    vi.stubGlobal('document', undefined)
    expect(absoluteUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(() => absoluteUrl('/x')).toThrow(/absolute asset base URL/)
  })

  it('loads the rig from rigBaseUrl and the classic layers from assetsBaseUrl', async () => {
    expect(getHeroRigUrl({ assetsBaseUrl: '/a/' })).toBe('/a/hero-rig/baked/rig.json')
    expect(getHeroRigUrl({ assetsBaseUrl: '/a', rigBaseUrl: '/r/' })).toBe('/r/hero-rig/baked/rig.json')
    expect(getHeroSkeletonUrl({ assetsBaseUrl: '/a', rigBaseUrl: '/r' })).toBe('/r/hero-rig/skeleton.json')

    const visualGenes = decodeVisualGenes('170877259497388213840353281232231169976585066888929467746175634464967719')
    const assets = { assetsBaseUrl: 'https://a.example/realm', rigBaseUrl: 'https://a.example/shared' }
    const { r } = await renderer({ source: 'local', atlas: undefined, assets }, { id: '2', chainId: 8217, gender: 'female', class: 'knight', visualGenes })
    await r.preload(HURT)
    const urls = [...fetched, ...imageSources.filter(u => !u.startsWith('data:'))]
    expect(urls).toContain('https://a.example/realm/hero-classic/parts.json')
    expect(urls).toContain('https://a.example/shared/hero-rig/baked/rig.json')
    expect(urls).toContain('https://a.example/shared/hero-rig/skeleton.atlas')
    expect(urls).toContain('https://a.example/shared/hero-rig/skeleton.png')
    expect(urls.some(u => u.startsWith('https://a.example/shared/hero-rig/baked/anims/'))).toBe(true)
    expect(urls.some(u => u.startsWith('https://a.example/shared/hero-rig/weapons/'))).toBe(true)
    expect(urls.filter(u => u.includes('/realm/hero-rig') || u.includes('/shared/hero-classic'))).toEqual([])
  })
})
