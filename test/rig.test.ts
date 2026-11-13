import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Equipment } from '../src/equipment/types'
import { RIG_EQUIPMENT } from '../src/generated/rig-equipment'
import { CLASS_DEFAULT_WEAPON, HERO_ANIMATIONS, getHeroWeaponAnimationSet, professionAnimation, weaponAnimation, type WeaponAnimationSet } from '../src/renderer'
import { gearCells } from '../src/renderer/heroAtlas'
import { parseAtlas } from '../src/renderer/rig/atlas'
import { WORLD_STRIDE, blendPoses, decodeAnimation, emptyPose, frameAt, poseAt, type BakedAnimation, type BakedRig } from '../src/renderer/rig/baked'
import { RigPlayer } from '../src/renderer/rig/player'

const RIG_DIR = path.join(__dirname, '../assets/hero-rig')
const BAKED = path.join(RIG_DIR, 'baked')
const rig: BakedRig = JSON.parse(fs.readFileSync(path.join(BAKED, 'rig.json'), 'utf8'))
const skeleton = JSON.parse(fs.readFileSync(path.join(RIG_DIR, 'skeleton.json'), 'utf8'))

function load(name: string): BakedAnimation {
  const entry = rig.animations.find(a => a.name === name)
  if (!entry) throw new Error(`no ${name}`)
  return decodeAnimation(rig, JSON.parse(fs.readFileSync(path.join(BAKED, entry.file), 'utf8')), entry.duration)
}

describe('baked hero rig', () => {
  it('is baked from the shipped skeleton', () => {
    // Fails when skeleton.json changes until assets/hero-rig/baked/ is regenerated.
    expect((rig as BakedRig & { source: string }).source).toBe(skeleton.skeleton.hash)
    expect(rig.bones).toEqual(skeleton.bones.map((b: { name: string }) => b.name))
    expect(rig.animations.map(a => a.name).sort()).toEqual(Object.keys(skeleton.animations).sort())
  })

  it('has every animation the SDK names', () => {
    const names = [
      ...Object.values(HERO_ANIMATIONS),
      ...Object.values(CLASS_DEFAULT_WEAPON).map(w => weaponAnimation(w)),
      ...(['mining', 'gardening', 'fishing', 'foraging'] as const).map(professionAnimation),
    ]
    const baked = new Set(rig.animations.map(a => a.name))
    for (const name of names) expect(baked.has(name), name).toBe(true)
  })

  it('decodes every animation to finite transforms at the stated frame rate', () => {
    for (const entry of rig.animations) {
      const a = load(entry.name)
      expect(a.frames).toBe(Math.floor(entry.duration * rig.fps + 1e-6) + 1)
      expect(a.world.length).toBe((a.frames + 1) * rig.bones.length * WORLD_STRIDE)
      expect(a.world.every(Number.isFinite), entry.name).toBe(true)
      for (const [f, slot] of a.attachments) expect(f <= a.frames && slot < rig.slots.length).toBe(true)
      for (const [, order] of a.drawOrder) expect([...order].sort((x, y) => x - y)).toEqual(rig.slots.map((_, i) => i))
    }
  })

  it('looks up frames and slot changes by time', () => {
    const a = load('GENERIC/Walk')
    expect(frameAt(rig, a, 0)).toBe(0)
    expect(frameAt(rig, a, 1 / rig.fps)).toBe(1)
    expect(frameAt(rig, a, a.duration + 5)).toBe(a.frames - 1)
    // A loop's final instant uses the extra loop-end frame when the last frame sits on the end.
    const loop = load('CLASS/Warrior/Whirlwind-Loop')
    expect(frameAt(rig, loop, loop.duration - 0.001, true)).toBe(loop.frames)
    expect(frameAt(rig, loop, loop.duration - 0.001, false)).toBe(loop.frames - 1)
    const withSwap = rig.animations.map(e => load(e.name)).find(x => x.attachments.length)!
    const [f, slot, name] = withSwap.attachments[0]
    const pose = emptyPose(rig)
    expect(poseAt(rig, withSwap, f, pose).attachments[slot]).toBe(name)
  })
})

describe('blending', () => {
  it('turns bones rather than shrinking them', () => {
    const a = emptyPose(rig)
    const b = emptyPose(rig)
    a.world.set([1, 0, 0, 1, 0, 0])
    b.world.set([-1, 0, 0, -1, 10, 0]) // turned 180°
    blendPoses(a, b, 0.5)
    expect(Math.hypot(a.world[0], a.world[2])).toBeCloseTo(1)
    expect(Math.hypot(a.world[1], a.world[3])).toBeCloseTo(1)
    expect(a.world[4]).toBeCloseTo(5)
  })

  it('keeps mirrored bones mirrored', () => {
    const a = emptyPose(rig)
    const b = emptyPose(rig)
    a.world.set([-1, 0, 0, 1, 0, 0])
    b.world.set([-1, 0, 0, 1, 0, 0])
    blendPoses(a, b, 0.3)
    expect(a.world[0] * a.world[3] - a.world[1] * a.world[2]).toBeCloseTo(-1)
  })
})

describe('player', () => {
  const idle = load('WEAPONS/1H Sword/1H Sword Casual')
  const hurt = load('GENERIC/Hurt')

  it('returns to the queued animation, crossfading as the one-shot ends', () => {
    const player = new RigPlayer(rig, 0.2)
    player.set(idle)
    player.update(1)
    player.set(hurt, false)
    player.add(idle)
    const frames: string[] = []
    for (let t = 0; t < hurt.duration + 0.1; t += 1 / 60) {
      player.update(1 / 60)
      frames.push(player.animation!)
    }
    const switchedAt = frames.indexOf(idle.name) / 60
    expect(switchedAt).toBeGreaterThan(hurt.duration - 0.2)
    expect(switchedAt).toBeLessThan(hurt.duration - 0.2 + 2 / 60)
  })

  it('shows the baked frame exactly when not fading', () => {
    const player = new RigPlayer(rig, 0)
    player.set(idle)
    player.update(0.5)
    const expected = poseAt(rig, idle, frameAt(rig, idle, 0.5), emptyPose(rig))
    expect(Array.from(player.apply()!.world)).toEqual(Array.from(expected.world))
  })

  it('fires keyed events', () => {
    const attack = rig.animations.map(e => load(e.name)).find(a => a.events.some(e => e.name === 'hit'))!
    const player = new RigPlayer(rig, 0)
    const seen: string[] = []
    player.onEvent = e => seen.push(e.name)
    player.set(attack, false)
    player.update(attack.duration + 0.1)
    expect(seen).toContain('hit')
  })
})

describe('atlas', () => {
  it('reads the rig atlas', () => {
    const { pages, regions } = parseAtlas(fs.readFileSync(path.join(RIG_DIR, 'skeleton.atlas'), 'utf8'))
    expect(pages).toEqual(['skeleton.png'])
    expect(regions.get('Mask')).toMatchObject({ x: 2, y: 2, width: 64, height: 64, originalWidth: 64, originalHeight: 64 })
  })

  it('reads trimmed regions in the older format', () => {
    const { regions } = parseAtlas('page.png\nsize: 64,64\nformat: RGBA8888\nhead\n  rotate: false\n  xy: 2, 4\n  size: 10, 12\n  orig: 16, 16\n  offset: 3, 1\n  index: -1\n')
    expect(regions.get('head')).toMatchObject({ x: 2, y: 4, width: 10, height: 12, originalWidth: 16, originalHeight: 16, offsetX: 3, offsetY: 1 })
  })
})

describe('equipped gear', () => {
  const item = (typeId: number, displayId: number) => ({ typeId, displayId }) as unknown as Equipment

  it('ships a 64x64 rig cell for every item in the table', () => {
    const files = [...Object.values(RIG_EQUIPMENT.weapons).flatMap(Object.values), ...Object.values(RIG_EQUIPMENT.offhands)]
    expect(files.length).toBeGreaterThan(40)
    for (const file of files) {
      const buf = fs.readFileSync(path.join(RIG_DIR, file))
      expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], file).toEqual([64, 64])
    }
  })

  it('puts weapons, bows and shields in the right cells', () => {
    // 1H Sword (11) #3 Bronze Spatha with Bronze Shield (offhand #3).
    expect(gearCells({ weapon1: item(11, 3), offhand1: item(0, 3) })).toEqual({
      weapon: 'weapons/equippable/1hsword/bronze-spatha.png',
      shield: 'weapons/equippable/shield/bronze-shield.png',
    })
    // A bow goes in the bow cell and empties the hand; bows are two-handed, so no shield.
    expect(gearCells({ weapon1: item(3, 3), offhand1: item(0, 3) })).toEqual({
      bow: 'weapons/equippable/bow/maple-longbow.png',
      weapon: null,
      shield: null,
    })
    // A visage changes the look; the weapon underneath decides two-handedness.
    expect(gearCells({ weapon1: item(12, 3), weapon1Visage: item(11, 2) })).toEqual({
      weapon: 'weapons/equippable/1hsword/toy-sword.png',
      shield: null,
    })
    // No art for this item: keep the class default.
    expect(gearCells({ weapon1: item(1, 1) })).toEqual({})
    expect(gearCells(null)).toEqual({})
  })

  it('plays the equipped weapon type, falling back to the class', () => {
    expect(getHeroWeaponAnimationSet({ class: 'wizard' })).toBe('1H Wand')
    expect(getHeroWeaponAnimationSet({ class: 'wizard' }, { weapon1: item(3, 1) })).toBe('Bow')
    expect(getHeroWeaponAnimationSet({ class: 'knight' }, { weapon1: item(12, 1) })).toBe('2H Sword')
    // The rig has no 1H Axe animations.
    expect(getHeroWeaponAnimationSet({ class: 'knight' }, { weapon1: item(1, 1) })).toBe('1H Sword')
    // Whatever set a weapon type picks, the rig has its animations.
    for (const typeId of Object.keys(RIG_EQUIPMENT.animationSets)) {
      const set: WeaponAnimationSet = getHeroWeaponAnimationSet({ class: 'knight' }, { weapon1: item(Number(typeId), 1) })
      expect(rig.animations.some(a => a.name === weaponAnimation(set)), `${typeId}: ${set}`).toBe(true)
    }
  })
})
