import { getAssetConfig, type AssetConfig } from '../config'
import type { Equipment } from '../equipment/types'
import type { GeneratorAccessoryLook, GeneratorArt, GeneratorImage, GeneratorWeapons } from './generatorTypes'
import type { HeroAtlasImage, HeroAtlasInput } from './heroAtlas'
import { parseAtlas, type RigAtlas } from './rig/atlas'

/**
 * Builds a hero's rig atlas from the DFK hero generator's art, in the browser: the same atlas the
 * hero generator service drew for the game. Unlike the classic layers, it shows equipped armor and
 * accessories (helms, masks, crowns).
 *
 * The art is ready-made 64x64 rig cells: bodies per skin color, every class's clothing, heads
 * per skin and eye color, hair per color, appendages, weapons and the item art. The generator's
 * rules for combining them (src/generated/hero-generator.ts) were recorded from its own code.
 */

const CELL = 64
const EMPTY = 'basehero/base-canvas.png'

let artPromise: Promise<GeneratorArt> | null = null
/** The rules are ~150 KB, so they're loaded on first use rather than bundled into every app. */
function loadArt(): Promise<GeneratorArt> {
  return (artPromise ??= import('../generated/hero-generator').then(m => m.HERO_GENERATOR))
}

type Drawable = HTMLImageElement | HTMLCanvasElement

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  return c
}

const imageCache = new Map<string, Promise<Drawable>>()
/** Loads one of the generator's images; a missing one is drawn empty, as a blank cell. */
function loadImage(url: string): Promise<Drawable> {
  let pending = imageCache.get(url)
  if (!pending) {
    pending = new Promise<Drawable>(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(canvas(CELL, CELL))
      img.src = url
    })
    imageCache.set(url, pending)
  }
  return pending
}

/** The hero's slot in each placeholder the rules use, and the values for `{skin}`, `{d1}`, `{d2}`. */
interface Context {
  base: string
  refs: Record<string, GeneratorImage>
  vars: Record<string, string>
}

/** Draws a rule's image: a file, a placeholder for one of the hero's cells, or recorded steps. */
async function render(image: GeneratorImage, ctx: Context): Promise<Drawable> {
  if (typeof image === 'string') {
    if (image.startsWith('@')) {
      const ref = ctx.refs[image]
      if (ref === undefined) throw new Error(`Hero generator art: no ${image}`)
      return render(ref, ctx)
    }
    const file = image.replace(/\{(\w+)\}/g, (_, k: string) => ctx.vars[k] ?? '')
    return loadImage(`${ctx.base}/${file}`)
  }
  let current = await render(image.base, ctx)
  for (const op of image.ops) {
    if ('extract' in op) {
      const { left, top, width, height } = op.extract
      const out = canvas(width, height)
      out.getContext('2d')!.drawImage(current, -left, -top)
      current = out
    } else if ('resize' in op) {
      // Fit inside, keeping the aspect ratio, at the top left (sharp's `contain`).
      const { width, height } = op.resize
      const scale = Math.min(width / current.width, height / current.height)
      const out = canvas(width, height)
      out.getContext('2d')!.drawImage(current, 0, 0, current.width * scale, current.height * scale)
      current = out
    } else {
      const out = canvas(current.width, current.height)
      const c = out.getContext('2d')!
      c.drawImage(current, 0, 0)
      const layers = await Promise.all(op.composite.map(l => render(l.input, ctx)))
      op.composite.forEach((l, i) => {
        const img = layers[i]
        // Without an offset, sharp centers the layer.
        const left = l.left ?? Math.floor((out.width - img.width) / 2)
        const top = l.top ?? Math.floor((out.height - img.height) / 2)
        c.drawImage(img, left, top)
      })
      current = out
    }
  }
  return current
}

const BODY_PARTS = ['Body', 'LeftArmBtm', 'LeftArmTop', 'LeftFoot', 'LeftLeg', 'LeftLegBtm', 'RightFoot', 'RightLeg', 'RightLegBtm', 'RightArmBtm', 'RightArmTop'] as const

/** What an armor leaves the hero wearing: its class clothing, unless the armor replaces a part. */
const ARMOR_PARTS = {
  editedArmorBody: '@class/Body',
  editedArmorBehind: '@class/Behind',
  editedArmorLeftArmBtmPath: '@class/LeftArmBtm',
  editedArmorLeftArmTopPath: '@class/LeftArmTop',
  editedArmorRightArmBtmPath: '@class/RightArmBtm',
  editedArmorRightArmTopPath: '@class/RightArmTop',
  editedArmorLeftLegTopPath: '@class/LeftLeg',
  editedArmorLeftLegBottomPath: '@class/LeftLegBtm',
  editedArmorRightLegTopPath: '@class/RightLeg',
  editedArmorRightLegBottomPath: '@class/RightLegBtm',
  editedArmorLeftFootPath: '@class/LeftFoot',
  editedArmorRightFootPath: '@class/RightFoot',
} as const

const look = (item: Equipment | null | undefined) => (item ? { typeId: item.typeId, displayId: item.displayId, dyes: item.dyes } : null)

/** The weapon, shield and bow cells: the class's own, then the equipped shield, then the weapon. */
function weaponCells(art: GeneratorArt, heroClass: string, input: HeroAtlasInput): GeneratorWeapons {
  const gear = input.gear
  const cells = { ...(art.weapons.classes[heroClass] ?? art.weapons.classes.warrior) }
  const offhand = look(gear?.offhand1Visage ?? gear?.offhand1)
  if (offhand) Object.assign(cells, art.weapons.offhand[offhand.displayId])
  // After the shield: a two-handed weapon takes the shield away.
  const weapon = look(gear?.weapon1Visage ?? gear?.weapon1)
  if (weapon) {
    const rules = art.weapons.weapon[weapon.typeId]
    Object.assign(cells, rules?.[weapon.displayId] ?? rules?.['*'])
  }
  return cells
}

/** Everything the generator works out for a hero before drawing: each part's image, by name. */
async function resolveLook(hero: HeroAtlasInput, assets?: Partial<AssetConfig>) {
  const art = await loadArt()
  const v = hero.visualGenes
  const g = v.gender.d === 'female' ? 'female' : 'male'
  const heroClass = hero.class ?? 'warrior'
  const skin = v.skinColor.d ?? 'c58135'
  const eye = v.eyeColor.d ?? '203997'
  const headDir = `outputhero/${g}/heads/${skin}-${eye}/${g}_Head`
  const hairDir = `outputhero/${g}/hair/${v.hairColor.d}/${g[0]}${v.hairStyle.d}`

  const gear = hero.gear
  const armor = look(gear?.armorVisage ?? gear?.armor)
  const accessory = look(gear?.accessoryVisage ?? gear?.accessory)
  const armorLook = armor ? (art.armor[g]?.[`${armor.typeId}-${armor.displayId}`] ?? art.armor[g]?.[`*-${armor.displayId}`]) : undefined
  const acc: GeneratorAccessoryLook = (accessory && art.accessories[g]?.[accessory.displayId]) || {}

  const edited: Record<string, GeneratorImage> = { ...ARMOR_PARTS, ...armorLook }
  const refs: Record<string, GeneratorImage> = {
    '@hairFront': `${hairDir}f.png`,
    '@hairBack': `${hairDir}b.png`,
    '@headAppendage': `outputhero/headappendages/${v.appendageColor.d}/${v.headAppendage.d}.png`,
    '@head/standard': `${headDir}.png`,
    '@head/angry': `${headDir}_Angry.png`,
    '@head/closed': `${headDir}_EyesClosed.png`,
    '@head/mid': `${headDir}_EyesMid.png`,
  }
  for (const part of [...BODY_PARTS, 'Behind', 'Mask']) refs[`@class/${part}`] = `basehero/${g}/class/${heroClass}/${part}.png`
  refs['@armor/Body'] = edited.editedArmorBody
  refs['@armor/LeftArmBtm'] = edited.editedArmorLeftArmBtmPath
  refs['@armor/LeftLeg'] = edited.editedArmorLeftLegTopPath
  refs['@armor/LeftLegBtm'] = edited.editedArmorLeftLegBottomPath
  refs['@armor/RightLeg'] = edited.editedArmorRightLegTopPath
  refs['@armor/RightLegBtm'] = edited.editedArmorRightLegBottomPath

  // Accessories, in the generator's order: the body, the left arm, the head (over the body so
  // far), then the legs (over the armor's body).
  const combinedBody = acc.body
  refs['@body'] = combinedBody ?? edited.editedArmorBody
  const combinedLeftArm = acc.arm?.combinedLeftArm
  const head = (acc.head ?? {}) as Record<string, GeneratorImage | undefined> & { combinedHeadPaths?: Record<string, GeneratorImage> }
  const legs = acc.legs ?? {}
  const headPaths = head.combinedHeadPaths
  const d = accessory?.dyes ?? [0, 0]
  const ctx: Context = {
    base: `${getAssetConfig(assets).assetsBaseUrl.replace(/\/$/, '')}/hero-generator`,
    refs,
    vars: { skin, d1: String(d[0] || acc.dyes?.[0] || 0), d2: String(d[1] || acc.dyes?.[1] || 0) },
  }

  const bodyPart = (p: string) => `outputhero/${g}/${skin}/${g}_${p}.png`
  const parts = {
    nude: Object.fromEntries(BODY_PARTS.map(p => [p, bodyPart(p)])) as Record<(typeof BODY_PARTS)[number], string>,
    head: headPaths?.standard ?? refs['@head/standard'],
    headAngry: headPaths?.angry ?? refs['@head/angry'],
    headClosed: headPaths?.closed ?? refs['@head/closed'],
    headMid: headPaths?.mid ?? refs['@head/mid'],
    behind: edited.editedArmorBehind,
    body: head.combinedAccessoryBody ?? combinedBody ?? legs.combinedLegsBody ?? edited.editedArmorBody,
    leftArmTop: edited.editedArmorLeftArmTopPath,
    leftArmBtm: combinedLeftArm ?? edited.editedArmorLeftArmBtmPath,
    rightArmTop: edited.editedArmorRightArmTopPath,
    rightArmBtm: edited.editedArmorRightArmBtmPath,
    leftLeg: legs.editedLeftLegTopPath ?? edited.editedArmorLeftLegTopPath,
    leftLegBtm: legs.editedLeftLegBottomPath ?? edited.editedArmorLeftLegBottomPath,
    rightLeg: legs.editedRightLegTopPath ?? edited.editedArmorRightLegTopPath,
    rightLegBtm: legs.editedRightLegBottomPath ?? edited.editedArmorRightLegBottomPath,
    leftFoot: edited.editedArmorLeftFootPath,
    rightFoot: edited.editedArmorRightFootPath,
    hairBack: head.editedHairBack ?? refs['@hairBack'],
    hairFront: head.combinedHair ?? head.editedHairFront ?? refs['@hairFront'],
    headAppendage: head.editedHeadAppendage ?? refs['@headAppendage'],
    backAppendage: `outputhero/backappendages/${v.backAppendageColor.d}/${v.backAppendage.d}.png`,
    mask: head.combinedMask ?? '@class/Mask',
  }
  return { art, ctx, parts, female: g === 'female', weapons: weaponCells(art, heroClass, hero) }
}

type Placed = GeneratorImage | [GeneratorImage, number, number] // [image, left, top]

async function paint(target: HTMLCanvasElement, cells: Placed[][], ctx: Context, cellSize: number | null): Promise<void> {
  const c = target.getContext('2d')!
  c.imageSmoothingEnabled = false
  const drawn = await Promise.all(cells.map(row => Promise.all(row.map(cell => render(Array.isArray(cell) ? cell[0] : cell, ctx)))))
  cells.forEach((row, i) =>
    row.forEach((cell, j) => {
      const [left, top] = Array.isArray(cell) ? [cell[1], cell[2]] : [0, 0]
      c.drawImage(drawn[i][j], (cellSize ?? 0) * j + left, (cellSize ?? 0) * i + top)
    })
  )
}

/** Paints the hero's atlas texture from the hero generator's art, with its `.atlas` text. */
export async function buildGeneratorHeroAtlasImage(hero: HeroAtlasInput, assets?: Partial<AssetConfig>): Promise<HeroAtlasImage> {
  const { art, ctx, parts: p, female, weapons: w } = await resolveLook(hero, assets)
  // The generator's atlas, row by row (Hero.generateLayerAtlas).
  const rows: Placed[][] = [
    [p.head, p.nude.Body, p.nude.LeftArmBtm],
    [p.nude.LeftArmTop, p.nude.LeftFoot, p.nude.RightFoot],
    [p.nude.LeftLeg, p.nude.LeftLegBtm, p.nude.RightArmBtm],
    [p.nude.RightArmTop, p.nude.RightLeg, p.nude.RightLegBtm],
    [p.behind, p.body, p.leftArmBtm],
    [p.leftArmTop, p.leftFoot, p.rightFoot],
    [p.leftLeg, p.leftLegBtm, p.rightArmBtm],
    [p.rightArmTop, p.rightLeg, p.rightLegBtm],
    [p.hairBack, p.hairFront, [p.headAppendage, female ? 1 : 0, 0]],
    [w.mainWeapon, w.offhandWeapon, w.bowWeapon],
    [w.mainWeapon, w.offhandWeapon, w.bowWeapon],
    ['basehero/weapons/arrow.png', 'basehero/weapons/bow-string_bottom.png', 'basehero/weapons/bow-string_top.png'],
    [p.headAngry, p.headClosed, p.headMid],
    ['basehero/tools/hoe.png', 'basehero/tools/pickaxe.png', 'basehero/tools/basket.png'],
    ['basehero/tools/fishingpole.png', 'basehero/tools/fishingline.png'],
    [p.backAppendage, 'basehero/shadow.png', 'basehero/shadow-3d.png'],
    [p.mask, 'basehero/tools/stool.png', 'basehero/tools/weight.png'],
    ['basehero/weapons/pirate-gun.png', EMPTY],
  ]
  const page = canvas(CELL * 3, CELL * rows.length)
  await paint(page, rows, ctx, CELL)
  return { canvas: page, atlasText: art.atlas.replace('{page}', 'hero') }
}

/**
 * The hero standing still, with a transparent background: the picture the hero generator service
 * served as the hero's image (Hero.generateHeroImage), 64x64 pixels times `scale` (default 4).
 * Shows equipped armor and accessories from `hero.gear`; weapons aren't drawn.
 */
export async function renderGeneratorHero(
  hero: HeroAtlasInput,
  { scale = 4, assets }: { scale?: number; assets?: Partial<AssetConfig> } = {}
): Promise<HTMLCanvasElement> {
  const { ctx, parts: p, female } = await resolveLook(hero, assets)
  const hair = (img: GeneratorImage): Placed => [img, 14, 0]
  // Back to front, as the generator stacks them.
  const layers: Placed[] = [
    [p.backAppendage, 4, 0],
    p.behind,
    p.nude.RightArmBtm,
    p.rightArmBtm,
    p.nude.RightArmTop,
    p.rightArmTop,
    p.nude.RightLeg,
    p.rightLeg,
    p.nude.RightLegBtm,
    p.rightLegBtm,
    p.nude.LeftLeg,
    p.leftLeg,
    p.nude.LeftLegBtm,
    p.leftLegBtm,
    p.nude.RightFoot,
    p.rightFoot,
    p.nude.LeftFoot,
    p.leftFoot,
    hair(p.hairBack),
    p.nude.Body,
    p.body,
    p.head,
    p.mask,
    p.nude.LeftArmTop,
    p.leftArmTop,
    p.nude.LeftArmBtm,
    p.leftArmBtm,
    hair(p.hairFront),
    [p.headAppendage, female ? 1 : 0, 0],
  ]
  const out = canvas(CELL, CELL)
  await paint(out, [layers], ctx, null)
  if (scale === 1) return out
  const scaled = canvas(CELL * scale, CELL * scale)
  scaled.getContext('2d')!.drawImage(out, 0, 0, CELL * scale, CELL * scale)
  return scaled
}

/** The hero's atlas from the hero generator's art, ready for `HeroRenderer` (or `drawRig`). */
export async function buildGeneratorHeroAtlas(hero: HeroAtlasInput, assets?: Partial<AssetConfig>): Promise<RigAtlas> {
  const { canvas: page, atlasText } = await buildGeneratorHeroAtlasImage(hero, assets)
  return { pages: [page], regions: parseAtlas(atlasText).regions }
}
