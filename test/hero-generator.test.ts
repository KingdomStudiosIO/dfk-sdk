/**
 * The hero generator's art: the recorded rules, the shipped images, and the atlas and portrait
 * built from them. Drawing runs against stand-in canvases that log what's drawn where.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeVisualGenes, SKIN_COLORS } from '../src'
import type { Equipment } from '../src/equipment/types'
import { HERO_GENERATOR } from '../src/generated/hero-generator'
import { HeroRenderer } from '../src/renderer'
import { buildGeneratorHeroAtlas, buildGeneratorHeroAtlasImage, renderGeneratorHero } from '../src/renderer/generatorAtlas'
import type { GeneratorImage } from '../src/renderer/generatorTypes'
import type { HeroAtlasInput } from '../src/renderer/heroAtlas'

const ART = path.join(__dirname, '../assets/hero-generator')
const BASE = 'https://cdn.example/assets'

interface Draw {
  src: string
  x: number
  y: number
  w?: number
  h?: number
}

/** A canvas that logs what's drawn on it. Other canvases drawn onto it are logged by their own log. */
class LogCanvas {
  draws: Draw[] = []
  constructor(
    public width = 0,
    public height = 0
  ) {}
  get label(): string {
    return `canvas(${this.draws.map(d => `${d.src}@${d.x},${d.y}`).join(' + ')})`
  }
  getContext() {
    return {
      imageSmoothingEnabled: true,
      drawImage: (img: { label: string }, x: number, y: number, w?: number, h?: number) => this.draws.push({ src: img.label, x, y, w, h }),
    }
  }
}

let loaded: string[] = []
class FileImage {
  crossOrigin = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  label = ''
  width = 64
  height = 64
  set src(url: string) {
    loaded.push(url)
    this.label = url.slice(url.indexOf('/hero-generator/') + '/hero-generator/'.length)
    const ok = fs.existsSync(path.join(ART, this.label))
    setTimeout(() => (ok ? this.onload?.() : this.onerror?.()))
  }
}

beforeEach(() => {
  loaded = []
  vi.stubGlobal('Image', FileImage)
  vi.stubGlobal('document', { createElement: () => new LogCanvas() })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// Golden visual genes from the game client's tests (female).
const visualGenes = decodeVisualGenes('170877259497388213840353281232231169976585066888929467746175634464967719')
const item = (typeId: number, displayId: number, dyes: [number, number] = [0, 0]) => ({ typeId, displayId, dyes }) as unknown as Equipment
const atlasOf = async (hero: HeroAtlasInput) => {
  const { canvas, atlasText } = await buildGeneratorHeroAtlasImage(hero, { assetsBaseUrl: BASE })
  const page = canvas as unknown as LogCanvas
  /** What was drawn in the cell at (column, row). */
  const cell = (col: number, row: number) => page.draws.find(d => d.x - (d.x % 64) === col * 64 && d.y === row * 64)!
  return { page, atlasText, cell }
}

describe('hero generator rules', () => {
  const files = (img: GeneratorImage | Record<string, unknown> | undefined, out: string[] = []): string[] => {
    if (typeof img === 'string') out.push(img)
    else if (img && typeof img === 'object') Object.values(img).forEach(v => files(v as GeneratorImage, out))
    return out
  }
  const all = files(HERO_GENERATOR as unknown as Record<string, unknown>).filter(f => f.endsWith('.png'))

  it('ships every image the rules name', () => {
    expect(all.length).toBeGreaterThan(300)
    const skins = Object.values(SKIN_COLORS)
    for (const file of new Set(all)) {
      if (file.includes('{d1}') || file.includes('{d2}')) continue // dyed: checked below
      for (const f of file.includes('{skin}') ? skins.map(s => file.replace('{skin}', s)) : [file]) {
        expect(fs.existsSync(path.join(ART, f)), f).toBe(true)
      }
    }
  })

  it("ships each dyed accessory in its default dyes", () => {
    const dyed = Object.values(HERO_GENERATOR.accessories).flatMap(byId => Object.values(byId).filter(a => a.dyes))
    expect(dyed.length).toBeGreaterThan(0)
    for (const a of dyed) {
      for (const f of files(a as unknown as Record<string, unknown>).filter(f => f.includes('{d1}'))) {
        const file = f.replace('{d1}', String(a.dyes![0])).replace('{d2}', String(a.dyes![1]))
        expect(fs.existsSync(path.join(ART, file)), file).toBe(true)
      }
    }
  })

  it('has a look for every armor and accessory in both genders', () => {
    expect(Object.keys(HERO_GENERATOR.armor.male).sort()).toEqual(Object.keys(HERO_GENERATOR.armor.female).sort())
    expect(Object.keys(HERO_GENERATOR.accessories.male).sort()).toEqual(Object.keys(HERO_GENERATOR.accessories.female).sort())
    // All-Star Tunic (light armor #7), and the Shellmet's default dyes.
    expect(HERO_GENERATOR.armor.male['1-7'].editedArmorBody).toBe('basehero/armor/armor_1-7/male/Body.png')
    expect(HERO_GENERATOR.accessories.male[24].dyes).toEqual([2, 2])
  })

  it('covers every region the rig draws', () => {
    const regions = new Set(HERO_GENERATOR.atlas.split('\n').map(l => l.trim()).filter(l => l && !l.includes(':')))
    const rig = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/hero-rig/baked/rig.json'), 'utf8'))
    const used = new Set<string>()
    for (const slots of Object.values(rig.skins) as Record<string, Record<string, { region: string }>>[])
      for (const atts of Object.values(slots)) for (const a of Object.values(atts)) used.add(a.region)
    expect([...used].filter(r => !regions.has(r))).toEqual([])
  })
})

describe('buildGeneratorHeroAtlasImage', () => {
  it("lays out the hero's own cells", async () => {
    const { page, atlasText, cell } = await atlasOf({ class: 'knight', visualGenes })
    expect([page.width, page.height]).toEqual([192, 64 * 18])
    expect(atlasText.split('\n')[0]).toBe('hero.png')
    const skin = visualGenes.skinColor.d
    const eye = visualGenes.eyeColor.d
    expect(cell(0, 0).src).toBe(`outputhero/female/heads/${skin}-${eye}/female_Head.png`)
    expect(cell(1, 0).src).toBe(`outputhero/female/${skin}/female_Body.png`)
    expect(cell(1, 4).src).toBe('basehero/female/class/knight/Body.png')
    expect(cell(1, 8).src).toBe(`outputhero/female/hair/${visualGenes.hairColor.d}/f${visualGenes.hairStyle.d}f.png`)
    // Female head appendages sit one pixel right.
    expect(cell(2, 8).x).toBe(128 + 1)
    expect([cell(0, 9).src, cell(1, 9).src, cell(2, 9).src]).toEqual([
      'basehero/weapons/knight-weapon.png',
      'basehero/weapons/knight-shield.png',
      'basehero/base-canvas.png',
    ])
    expect(cell(0, 16).src).toBe('basehero/female/class/knight/Mask.png')
  })

  it('dresses the hero in equipped armor, keeping its class look elsewhere', async () => {
    const { cell } = await atlasOf({ class: 'knight', visualGenes, gear: { armor: item(1, 7) } })
    expect(cell(1, 4).src).toBe('basehero/armor/armor_1-7/female/Body.png')
    expect(cell(0, 4).src).toBe('basehero/armor/armor_1-7/female/Behind.png')
    expect(cell(0, 16).src).toBe('basehero/female/class/knight/Mask.png')
    // A visage changes the look.
    const visage = await atlasOf({ class: 'knight', visualGenes, gear: { armor: item(1, 7), armorVisage: item(1, 2) } })
    expect(visage.cell(1, 4).src).toBe('basehero/armor/armor_1-2/female/Body.png')
  })

  it('puts helms over the hair, with the item dyes or their defaults', async () => {
    // The All-Star Helm: the hair with the helm pasted over it.
    const helm = await atlasOf({ class: 'knight', visualGenes, gear: { accessory: item(1, 28) } })
    const hair = helm.cell(1, 8).src
    expect(hair).toContain('basehero/accessories/accessory_28/female/Mask.png')
    expect(hair).toContain(`/f${visualGenes.hairStyle.d}f.png`)
    expect(helm.cell(2, 8).src).toBe('basehero/base-canvas.png') // no head appendage under a helm

    const plain = await atlasOf({ class: 'knight', visualGenes, gear: { accessory: item(1, 24) } })
    expect(plain.cell(1, 8).src).toContain('outputhero/accessories/accessory_24/2-2/Mask.png')
    const dyed = await atlasOf({ class: 'knight', visualGenes, gear: { accessory: item(1, 24, [9, 10]) } })
    expect(dyed.cell(1, 8).src).toContain('outputhero/accessories/accessory_24/9-10/Mask.png')
  })

  it('crops and pads before pasting, as the generator does', async () => {
    // Secondhand Pants: the top 40 rows of the body, padded back to 64x64, with the pants over it.
    const { cell } = await atlasOf({ class: 'knight', visualGenes, gear: { accessory: item(1, 4) } })
    const body = cell(1, 4).src
    expect(body).toMatch(/^canvas\(canvas\(canvas\(basehero\/female\/class\/knight\/Body\.png@0,0\)@0,0\)@0,0 \+ outputhero\/accessories\/accessory_4\/1-1\/Body\.png@0,0\)$/)
  })

  it('swaps weapons and drops the shield for two-handed ones', async () => {
    const shield = await atlasOf({ class: 'knight', visualGenes, gear: { offhand1: item(2, 3) } })
    expect(shield.cell(1, 9).src).toBe('basehero/weapons/shield/3/shield.png')
    const greatsword = await atlasOf({ class: 'knight', visualGenes, gear: { weapon1: item(12, 3), offhand1: item(2, 3) } })
    expect(greatsword.cell(0, 9).src).toBe('basehero/weapons/2hsword/3/weapon.png')
    expect(greatsword.cell(1, 9).src).toBe('basehero/base-canvas.png')
    const bow = await atlasOf({ class: 'knight', visualGenes, gear: { weapon1: item(3, 3) } })
    expect([bow.cell(0, 9).src, bow.cell(2, 9).src]).toEqual(['basehero/base-canvas.png', 'basehero/weapons/bow/3/weapon.png'])
  })

  it('loads from the asset base', async () => {
    // A base no other test uses, so nothing is cached yet.
    await buildGeneratorHeroAtlas({ class: 'wizard', visualGenes }, { assetsBaseUrl: '/own-base/' })
    expect(loaded.length).toBeGreaterThan(30)
    expect(loaded.every(u => u.startsWith('/own-base/hero-generator/'))).toBe(true)
  })
})

describe('renderGeneratorHero', () => {
  it('stacks the parts back to front at the scale asked for', async () => {
    const out = (await renderGeneratorHero({ class: 'knight', visualGenes, gear: { armor: item(1, 7) } }, { scale: 2, assets: { assetsBaseUrl: BASE } })) as unknown as LogCanvas
    expect([out.width, out.height]).toEqual([128, 128])
    const base = out.draws[0].src
    const layers = base.slice('canvas('.length, -1).split(' + ')
    expect(layers[0]).toMatch(/^outputhero\/backappendages\/\w+\/\d+\.png@4,0$/)
    expect(layers).toContain('basehero/armor/armor_1-7/female/Body.png@0,0')
    expect(layers.some(l => /\/f\d+b\.png@14,0$/.test(l))).toBe(true) // hair sits 14px right
    expect(layers.findIndex(l => l.includes('_Head.png'))).toBeGreaterThan(layers.findIndex(l => l.includes('armor_1-7/female/Body.png')))
  })
})

describe("HeroRenderer source: 'generator'", () => {
  it('builds the hero generator atlas', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const file = path.join(__dirname, '../assets/hero-rig', url.slice(url.indexOf('/hero-rig/') + '/hero-rig/'.length))
      const ok = fs.existsSync(file)
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
    })
    const canvas = new LogCanvas(100, 100)
    for (const source of ['generator', 'auto'] as const) {
      const r = new HeroRenderer(canvas as unknown as HTMLCanvasElement, { id: '1', chainId: 8217, gender: 'female', class: 'knight', visualGenes }, {
        source,
        autoplay: false,
        assets: { assetsBaseUrl: `https://${source}.example/assets` },
      })
      await r.ready
      expect(r.attachmentImage('Head')).not.toBeNull()
      expect(loaded.some(u => u.startsWith(`https://${source}.example/assets/hero-generator/basehero/female/class/knight/`))).toBe(true)
    }
  })
})
