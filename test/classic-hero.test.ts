import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeVisualGenes, loadClassicHeroManifest, resolveClassicHeroLayers } from '../src'

const svgs: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/hero-classic/parts.json'), 'utf8'))
// Golden visual genes from the game client's tests (female, hair style 0…).
const VISUAL_GENES = '170877259497388213840353281232231169976585066888929467746175634464967719'

describe('classic hero layers', () => {
  it('ships art for every class, gender and referenced layer', async () => {
    const manifest = await loadClassicHeroManifest()
    expect(Object.keys(manifest.classes.male)).toHaveLength(22)
    expect(Object.keys(manifest.classes.female)).toHaveLength(22)
    const referenced = new Set<string>()
    const walk = (parts: { layers: { src?: string }[] }[]) => parts.forEach(p => p.layers.forEach(l => l.src && referenced.add(l.src)))
    for (const g of ['male', 'female'] as const) {
      Object.values(manifest.classes[g]).forEach(walk)
      Object.values(manifest.hair[g]).forEach(walk)
    }
    Object.values(manifest.headAppendage).forEach(walk)
    Object.values(manifest.backAppendage).forEach(walk)
    for (const src of referenced) expect(svgs[src], src).toMatch(/<svg[\s>]/)
  })

  it('resolves a hero into colored layers in paint order', async () => {
    const manifest = await loadClassicHeroManifest()
    const visualGenes = decodeVisualGenes(VISUAL_GENES)
    const layers = resolveClassicHeroLayers({ class: 'knight', visualGenes }, manifest, svgs)
    const skin = `#${visualGenes.skinColor.d}`
    const hair = `#${visualGenes.hairColor.d}`

    const head = layers.filter(l => l.part === 'heroHead')
    expect(head.some(l => l.role === 'color' && l.svg.includes(`stroke="${skin}"`))).toBe(true)
    expect(layers.some(l => l.part === 'heroHairFront' && l.svg.includes(`stroke="${hair}"`))).toBe(true)
    expect(layers.some(l => l.role === 'clothing' && l.svg.length > 0 && l.part === 'heroBody')).toBe(true)

    // Eyes and appendages are offset within the 30x45 frame.
    const eyes = layers.find(l => l.part === 'heroEyes')!
    expect([eyes.x, eyes.y]).toEqual([12, visualGenes.gender.d === 'male' ? 15 : 16])

    // Back appendage and cape paint first; front hair and head appendage last.
    const order = layers.map(l => l.part)
    expect(order.indexOf('heroBody')).toBeGreaterThan(order.indexOf('heroBehind'))
    expect(order.lastIndexOf('heroHead')).toBeLessThan(order.indexOf('heroHairFront'))
    // Inside a body part: skin color, then shading, then clothing on top.
    const body = layers.filter(l => l.part === 'heroBody').map(l => l.role)
    expect(body.indexOf('color')).toBeLessThan(body.indexOf('clothing'))
    expect(layers.find(l => l.part === 'heroBody' && l.role === 'highlight')?.opacity).toBe(0.4)

    // Weapons are positioned per class by CSS in the game, so classic renders leave them out.
    expect(layers.some(l => l.part === 'heroWeapon')).toBe(false)
  })

  it('falls back to warrior art for unknown classes and skips missing hair', async () => {
    const manifest = await loadClassicHeroManifest()
    const visualGenes = { ...decodeVisualGenes(VISUAL_GENES), hairStyle: { d: 999, r1: 0, r2: 0, r3: 0 } } as any
    const layers = resolveClassicHeroLayers({ class: undefined, visualGenes }, manifest, svgs)
    expect(layers.some(l => l.part === 'heroBody')).toBe(true)
    expect(layers.some(l => l.part.startsWith('heroHair'))).toBe(false)
  })
})

describe('hero card data', () => {
  it('ranks gene trait ids like the game', async () => {
    const { getGeneRarity } = await import('../src')
    expect([0, 15, 16, 23, 24, 27, 28].map(id => getGeneRarity(id))).toEqual(['basic', 'basic', 'advanced', 'advanced', 'elite', 'elite', 'exalted'])
    expect(getGeneRarity(15, true)).toBe('limited')
  })

  it('ships the scoped card stylesheet and every icon it names', async () => {
    const { HERO_CARD_CSS, HERO_CARD_IMAGES } = await import('../src/generated/hero-card')
    expect(HERO_CARD_CSS).toContain('.dfk-heroCard')
    expect(HERO_CARD_CSS).not.toMatch(/\.heroCard\s*\{/) // every class is scoped
    const files = new Set<string>()
    const walk = (v: unknown): void => (typeof v === 'string' ? void files.add(v) : Object.values(v as object).forEach(walk))
    walk(HERO_CARD_IMAGES)
    for (const m of HERO_CARD_CSS.matchAll(/__DFK_ASSETS__\/hero-card\/([^")]+)/g)) files.add(m[1])
    for (const f of files) expect(fs.existsSync(path.join(__dirname, '../assets/hero-card', f)), f).toBe(true)
  })
})

describe('rig weapons', () => {
  it('has weapon art for every class except bow users, and shields for shield classes', async () => {
    const { RIG_WEAPONS } = await import('../src/generated/rig-weapons')
    const { HERO_CLASSES } = await import('../src')
    for (const cls of Object.values(HERO_CLASSES)) {
      const key = cls.toLowerCase()
      if (key === 'archer') continue // holds only the rig's bow
      const art = RIG_WEAPONS[key]
      expect(art?.weapon ?? art?.bow, cls).toBeDefined()
      for (const f of Object.values(art)) expect(fs.existsSync(path.join(__dirname, '../assets/hero-rig', f!)), f).toBe(true)
    }
    for (const cls of ['knight', 'warrior', 'legionnaire', 'paladin']) expect(RIG_WEAPONS[cls].shield, cls).toBeDefined()
  })
})
