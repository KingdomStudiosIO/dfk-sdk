import { describe, expect, it } from 'vitest'
import {
  STAT_GENE_SLOTS,
  VISUAL_GENE_SLOTS,
  decodeStatGenes,
  decodeVisualGenes,
  genesToKai,
  packGenes,
  unpackGenes,
} from '../src'

// Golden cases copied from the game client's convertGenes tests, so the SDK can't drift from it.
const STAT_GENES = '55595053337262516479463511619358733520326674122734274020548212557095372'
const VISUAL_GENES = '170877259497388213840353281232231169976585066888929467746175634464967719'

const strip = <T extends { raw: unknown }>(g: T) => {
  const { raw: _raw, ...rest } = g
  return rest
}

describe('decodeStatGenes', () => {
  it('matches the game client', () => {
    expect(strip(decodeStatGenes(STAT_GENES))).toEqual({
      class: { r3: 'knight', r2: 'warrior', r1: 'pirate', d: 'thief' },
      subClass: { r3: 'wizard', r2: 'monk', r1: 'archer', d: 'wizard' },
      profession: { r3: 'fishing', r2: 'fishing', r1: 'gardening', d: 'gardening' },
      passive1: { r3: 'Basic3', r2: 'Basic4', r1: 'Basic7', d: 'Basic1' },
      passive2: { r3: 'Basic1', r2: 'Basic6', r1: 'Basic5', d: 'Basic2' },
      active1: { r3: 'Basic4', r2: 'Basic8', r1: 'Basic4', d: 'Basic3' },
      active2: { r3: 'Basic1', r2: 'Basic4', r1: 'Basic5', d: 'Basic4' },
      statBoost1: { r3: 'VIT', r2: 'DEX', r1: 'STR', d: 'INT' },
      statBoost2: { r3: 'VIT', r2: 'WIS', r1: 'AGI', d: 'LCK' },
      crafting1: { r3: 'Armorsmithing', r2: 'Armorsmithing', r1: 'Blacksmithing', d: 'Enchanting' },
      element: { r3: 'earth', r2: 'lightning', r1: 'lightning', d: 'fire' },
      crafting2: { r3: 'Leatherworking', r2: 'Leatherworking', r1: 'Alchemy', d: 'Enchanting' },
    })
  })
})

describe('decodeVisualGenes', () => {
  it('matches the game client', () => {
    const g = decodeVisualGenes(VISUAL_GENES)
    expect(g.gender).toEqual({ r3: 'female', r2: 'female', r1: 'male', d: 'female' })
    expect(g.headAppendage).toEqual({ r3: 1, r2: 6, r1: 0, d: 1 })
    expect(g.backAppendage).toEqual({ r3: 4, r2: 4, r1: 2, d: 6 })
    expect(g.background).toEqual({ r3: 'plains', r2: 'forest', r1: 'plains', d: 'plains' })
    expect(g.hairStyle).toEqual({ r3: 0, r2: 7, r1: 3, d: 1 })
    expect(g.hairColor).toEqual({ r3: 'ab9159', r2: '8d6b3a', r1: 'ca93a7', d: 'd7bc65' })
    expect(g.eyeColor).toEqual({ r3: '896693', r2: '2494a2', r1: 'bb3f55', d: '2494a2' })
    expect(g.skinColor).toEqual({ r3: '57340c', r2: 'aa5c38', r1: '7b4a11', d: 'e6a861' })
    expect(g.appendageColor).toEqual({ r3: 'a88b47', r2: '3f2e40', r1: '830e18', d: 'a0304d' })
    expect(g.backAppendageColor).toEqual({ r3: 'c5bfa7', r2: 'd7d7d7', r1: '566f7d', d: '830e18' })
    expect(g.raw.visualUnknown1).toEqual({ r3: 0, r2: 4, r1: 2, d: 0 })
    expect(g.raw.visualUnknown2).toEqual({ r3: 4, r2: 3, r1: 1, d: 7 })
  })
})

describe('pack/unpack', () => {
  it('round-trips', () => {
    for (const [genes, slots] of [
      [STAT_GENES, STAT_GENE_SLOTS],
      [VISUAL_GENES, VISUAL_GENE_SLOTS],
    ] as const) {
      expect(packGenes(unpackGenes(genes, slots), slots).toString()).toBe(genes)
    }
  })

  it('handles zero genes', () => {
    expect(unpackGenes(0n, STAT_GENE_SLOTS).class).toEqual({ d: 0, r1: 0, r2: 0, r3: 0 })
    expect(genesToKai(0n)).toBe(Array(12).fill('1111').join(' '))
  })

  it('accepts ethers BigNumbers and strings', () => {
    const fromString = decodeStatGenes(STAT_GENES).class
    const fromObject = decodeStatGenes({ toString: () => STAT_GENES }).class
    expect(fromObject).toEqual(fromString)
  })
})
