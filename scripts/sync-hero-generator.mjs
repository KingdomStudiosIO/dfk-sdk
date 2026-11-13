#!/usr/bin/env node
/**
 * Regenerates src/generated/hero-generator.ts and assets/hero-generator from a git checkout of
 * the DFK hero generator (github.com/KingdomStudiosIO/hero-generator).
 *
 *   HERO_GENERATOR_DIR=../hero-generator npm run sync:hero-generator
 *
 * The hero generator was the service that drew heroes for the game: it pasted ready-made 64x64
 * rig cells (bodies by skin color, class clothing, heads, hair, appendages, weapons, and the art
 * of equipped armor and accessories) into one atlas per hero. The SDK now does the same in the
 * browser (`source: 'generator'`).
 *
 * The art is copied as-is. Its rules (which armor or accessory replaces or combines which cells)
 * live in the generator as code; this script runs that code with a stand-in for its image
 * library that records each operation instead of performing it, for every gender, armor,
 * accessory, weapon and class, and writes the recorded operations out as data.
 *
 * Files are read from the checkout's git HEAD, not its working tree: some paths differ only by
 * case (`7786B8`, `7786b8`), which a case-insensitive file system can't hold. The generator only
 * ever asks for the lowercase one, so the other is skipped.
 */
import { execFileSync } from 'node:child_process'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GEN = path.resolve(process.env.HERO_GENERATOR_DIR ?? path.join(ROOT, '..', 'hero-generator'))
const ASSETS = path.join(ROOT, 'assets', 'hero-generator')
const OUT = path.join(ROOT, 'src', 'generated', 'hero-generator.ts')

if (!fs.existsSync(path.join(GEN, 'src', 'utils', 'accessories.ts'))) {
  console.error(`Hero generator repo not found at ${GEN}. Set HERO_GENERATOR_DIR.`)
  process.exit(1)
}
const git = (...args) => execFileSync('git', ['-C', GEN, ...args], { maxBuffer: 1 << 28 })
const commit = git('rev-parse', 'HEAD').toString().trim()

// ---------------------------------------------------------------- Art
const files = git('ls-tree', '-r', '-z', 'HEAD', '--', 'basehero', 'outputhero')
  .toString()
  .split('\0')
  .filter(Boolean)
  .map(line => {
    const [meta, file] = line.split('\t')
    return { sha: meta.split(' ')[2], file }
  })
  .filter(f => f.file.endsWith('.png'))
const dirOf = p => p.slice(0, p.lastIndexOf('/'))
const byLower = new Map()
for (const f of files) {
  const key = f.file.toLowerCase()
  // Of paths that differ only by case, keep the one with lowercase directories.
  if (!byLower.has(key) || dirOf(f.file) === dirOf(key)) byLower.set(key, f)
}
const art = [...byLower.values()]
fs.rmSync(ASSETS, { recursive: true, force: true })
// One `git cat-file --batch` for every blob: "<sha> blob <size>\n<bytes>\n" each.
const batch = execFileSync('git', ['-C', GEN, 'cat-file', '--batch'], { input: art.map(f => f.sha).join('\n') + '\n', maxBuffer: 1 << 28 })
let at = 0
let bytes = 0
for (const { sha, file } of art) {
  const eol = batch.indexOf(10, at)
  const [gotSha, , size] = batch.subarray(at, eol).toString().split(' ')
  if (gotSha !== sha) throw new Error(`git cat-file: expected ${sha}, got ${gotSha}`)
  const data = batch.subarray(eol + 1, eol + 1 + Number(size))
  at = eol + 1 + Number(size) + 1
  const out = path.join(ASSETS, file)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, data)
  bytes += data.length
}
console.log(`copied ${art.length} images (${(bytes / 1e6).toFixed(1)} MB) to ${path.relative(ROOT, ASSETS)}; skipped ${files.length - art.length} case duplicates`)
const shipped = new Set(art.map(f => f.file))

// ---------------------------------------------------------------- Rules
// Every image the rules produce is a path, or a recorded `sharp(base).extract().resize().composite()`.
const MOCK_SHARP = `
export default function sharp(base) {
  if (typeof base !== 'string' && !(base && base.__image)) throw new Error('unsupported sharp input ' + JSON.stringify(base))
  const ops = []
  const api = {
    extract(r) { ops.push({ extract: { left: r.left, top: r.top, width: r.width, height: r.height } }); return api },
    resize(r) {
      if (r.fit !== 'contain' || r.position !== 'left top') throw new Error('unsupported resize ' + JSON.stringify(r))
      ops.push({ resize: { width: r.width, height: r.height } }); return api
    },
    composite(list) { ops.push({ composite: list.map(l => ({ input: l.input, top: l.top, left: l.left })) }); return api },
    toBuffer() { return Promise.resolve({ __image: true, base, ops }) },
  }
  return api
}`
const entry = `
export { getHeroArmor, getHeroHeadAccessory, getHeroBodyAccessory, getHeroArmAccessory, getHeroLegAccessory } from './src/utils/accessories'
export { getHeroWeaponsByClass, getEquipmentPaths } from './src/utils/weapons'
export { getAtlasString } from './src/utils/atlas-generator'
export { HeroTraits } from './src/definitions/hero-traits'
`
const bundle = await esbuild.build({
  stdin: { contents: entry, resolveDir: GEN, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
  plugins: [
    {
      name: 'record-sharp',
      setup(b) {
        b.onResolve({ filter: /^sharp$/ }, () => ({ path: 'sharp', namespace: 'record-sharp' }))
        b.onLoad({ filter: /.*/, namespace: 'record-sharp' }, () => ({ contents: MOCK_SHARP, loader: 'js' }))
      },
    },
  ],
})
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hero-generator-')), 'rules.mjs')
fs.writeFileSync(tmp, bundle.outputFiles[0].text)
const gen = await import(pathToFileURL(tmp).href)

/** A recorded image as plain data, checking sharp would run its steps in the order recorded. */
function image(v) {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') return v
  if (!v.__image) throw new Error('unexpected value ' + JSON.stringify(v))
  // sharp's pipeline: extract, then resize, then one composite.
  const rank = op => ('extract' in op ? 0 : 'resize' in op ? 1 : 2)
  v.ops.forEach((op, i) => {
    if (i && rank(op) < rank(v.ops[i - 1])) throw new Error('operations out of pipeline order')
  })
  if (v.ops.filter(op => 'composite' in op).length > 1) throw new Error('more than one composite in a chain')
  return {
    base: image(v.base),
    ops: v.ops.map(op => ('composite' in op ? { composite: op.composite.map(l => ({ ...l, input: image(l.input) })) } : op)),
  }
}
/** A function's outputs as data; an object of images (like `combinedHeadPaths`) stays an object. */
const record = obj =>
  Object.fromEntries(
    Object.entries(obj).flatMap(([k, v]) =>
      v === undefined || v === null ? [] : [[k, typeof v === 'object' && !v.__image ? record(v) : image(v)]]
    )
  )
/** Keeps only the outputs that differ from their input (the identity: nothing changed). */
const changed = (out, identity) => {
  const kept = Object.fromEntries(Object.entries(out).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(identity[k])))
  return Object.keys(kept).length ? kept : undefined
}

const GENDERS = ['male', 'female']
const source = fs.readFileSync(path.join(GEN, 'src/utils/accessories.ts'), 'utf8')
const idsOf = (text, re) => [...new Set([...text.matchAll(re)].map(m => Number(m[1])))].sort((a, b) => a - b)
const armorIds = idsOf(source, /armor\??\.displayId === (\d+)/g)
const accessoryIds = idsOf(source, /accessory\??\.displayId === (\d+)/g)

// Placeholders for what the runtime fills in: the hero's own cells, and its skin color and dyes.
const PARTS = ['Body', 'Behind', 'LeftArmBtm', 'LeftArmTop', 'LeftFoot', 'LeftLeg', 'LeftLegBtm', 'RightFoot', 'RightLeg', 'RightLegBtm', 'RightArmBtm', 'RightArmTop']
const ARMOR_ARGS = {
  bodyPath: '@class/Body',
  behindPath: '@class/Behind',
  leftArmBtmPath: '@class/LeftArmBtm',
  leftArmTopPath: '@class/LeftArmTop',
  rightArmBtmPath: '@class/RightArmBtm',
  rightArmTopPath: '@class/RightArmTop',
  leftLegTopPath: '@class/LeftLeg',
  leftLegBottomPath: '@class/LeftLegBtm',
  rightLegTopPath: '@class/RightLeg',
  rightLegBottomPath: '@class/RightLegBtm',
  leftFootPath: '@class/LeftFoot',
  rightFootPath: '@class/RightFoot',
}
const hero = (gender, extra) => ({ gender, skincolor: '{skin}', armor: null, accessory: null, weapon1: null, offhand1: null, ...extra })

const armorIdentity = record(await gen.getHeroArmor({ heroData: hero('male'), ...ARMOR_ARGS }))
const armor = {}
for (const gender of GENDERS) {
  armor[gender] = {}
  for (const armorType of [1, 2, 3]) {
    for (const displayId of armorIds) {
      const out = record(await gen.getHeroArmor({ heroData: hero(gender, { armor: { armorType, displayId, dye1: 0, dye2: 0 } }), ...ARMOR_ARGS }))
      const rule = changed(out, armorIdentity)
      if (rule) armor[gender][`${armorType}-${displayId}`] = rule
    }
  }
  // Looks that don't depend on the armor type are stored once, as `*-<displayId>`.
  for (const displayId of armorIds) {
    const looks = [1, 2, 3].map(t => JSON.stringify(armor[gender][`${t}-${displayId}`]))
    if (looks[0] !== undefined && looks.every(l => l === looks[0])) {
      armor[gender][`*-${displayId}`] = armor[gender][`1-${displayId}`]
      for (const t of [1, 2, 3]) delete armor[gender][`${t}-${displayId}`]
    }
  }
}

const HEAD_PATHS = { standard: '@head/standard', angry: '@head/angry', closed: '@head/closed', mid: '@head/mid' }
async function accessoryRule(gender, accessory) {
  const h = hero(gender, { accessory })
  return {
    head: record(await gen.getHeroHeadAccessory(h, '@class/Mask', '@hairFront', '@hairBack', '@headAppendage', '@body', HEAD_PATHS)),
    body: image(await gen.getHeroBodyAccessory(h, '@armor/Body')),
    arm: record(await gen.getHeroArmAccessory(h, '@armor/LeftArmBtm')),
    legs: record(await gen.getHeroLegAccessory(h, '@armor/Body', '@armor/LeftLeg', '@armor/LeftLegBtm', '@armor/RightLeg', '@armor/RightLegBtm')),
  }
}
const accessoryIdentity = await accessoryRule('male', null)
const accessories = {}
for (const gender of GENDERS) {
  accessories[gender] = {}
  for (const displayId of accessoryIds) {
    // Placeholder dyes show where dyes go; no dyes shows the defaults the code falls back to.
    const templated = await accessoryRule(gender, { accessoryType: 1, displayId, dye1: '{d1}', dye2: '{d2}' })
    const plain = JSON.stringify(await accessoryRule(gender, { accessoryType: 1, displayId, dye1: 0, dye2: 0 }))
    const text = JSON.stringify(templated)
    const rule = {
      head: changed(templated.head, accessoryIdentity.head),
      body: templated.body,
      arm: changed(templated.arm, accessoryIdentity.arm),
      legs: changed(templated.legs, accessoryIdentity.legs),
    }
    if (!rule.head && !rule.body && !rule.arm && !rule.legs) continue
    const entry = Object.fromEntries(Object.entries(rule).filter(([, v]) => v !== undefined))
    if (text !== plain) {
      // The first {d1}/{d2} captures the default; later ones must repeat it.
      const seen = new Set()
      const slot = (_, name) => (seen.has(name) ? `\\k<${name}>` : (seen.add(name), `(?<${name}>[^/"]*)`))
      const pattern = new RegExp('^' + text.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(d1|d2)\}/g, slot) + '$')
      const m = pattern.exec(plain)
      if (!m) throw new Error(`accessory ${displayId}: can't find its default dyes`)
      entry.dyes = [Number(m.groups.d1 ?? 0), Number(m.groups.d2 ?? 0)]
    }
    accessories[gender][displayId] = entry
  }
}

// Weapons: each class's defaults, then what an equipped weapon or shield overrides. A slot counts
// as overridden when it comes out the same for an archer and a knight, whose defaults differ in
// every slot.
const CLASS_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 24, 25, 26, 28]
const className = id => gen.HeroTraits.getHeroClass(String(id))
const weapons = (cls, extra) => gen.getHeroWeaponsByClass({ mainclass: String(cls), ...extra })
const classWeapons = Object.fromEntries(CLASS_IDS.map(id => [className(id), weapons(id, {})]))
const ARCHER = 3
const KNIGHT = 1
const overrides = extra => {
  const a = weapons(ARCHER, extra)
  const k = weapons(KNIGHT, extra)
  const out = {}
  for (const slot of ['mainWeapon', 'offhandWeapon', 'bowWeapon']) {
    if (a[slot] === k[slot] && (a[slot] !== classWeapons.archer[slot] || k[slot] !== classWeapons.knight[slot])) out[slot] = a[slot]
  }
  return Object.keys(out).length ? out : undefined
}
const weaponSource = fs.readFileSync(path.join(GEN, 'src/utils/weapons.ts'), 'utf8')
const weaponIds = idsOf(weaponSource, /weapon1\.displayId === (\d+)/g)
const offhandIds = idsOf(weaponSource, /offhand1\.displayId === (\d+)/g)
const OTHER = 999999
const weaponRules = {}
for (let type = 0; type <= 13; type++) {
  for (const displayId of [...weaponIds, OTHER]) {
    const o = overrides({ weapon1: { weaponType: type, displayId } })
    if (!o) continue
    const key = displayId === OTHER ? '*' : String(displayId)
    // Drop entries that only repeat what any item of the type does.
    ;(weaponRules[type] ??= {})[key] = o
  }
  const any = weaponRules[type]?.['*']
  if (any) for (const k of Object.keys(weaponRules[type])) if (k !== '*' && JSON.stringify(weaponRules[type][k]) === JSON.stringify(any)) delete weaponRules[type][k]
}
const offhandRules = {}
for (const displayId of offhandIds) {
  const o = overrides({ offhand1: { displayId } })
  if (o) offhandRules[displayId] = o
}

const atlas = (await gen.getAtlasString('{page}')).trim()

// ---------------------------------------------------------------- Check and write
const paths = new Set()
const walk = v => {
  if (typeof v === 'string') paths.add(v)
  else if (v && typeof v === 'object') Object.values(v).forEach(walk)
}
walk({ armor, accessories, classWeapons, weaponRules, offhandRules })
const missing = [...paths].filter(p => !p.startsWith('@') && !p.includes('{') && p.endsWith('.png') && !shipped.has(p))
if (missing.length) console.warn(`  ${missing.length} images the rules name aren't in the repo (drawn empty):\n    ${missing.join('\n    ')}`)

const data = { commit, atlas, armor, accessories, weapons: { classes: classWeapons, weapon: weaponRules, offhand: offhandRules } }
fs.writeFileSync(
  OUT,
  `// AUTO-GENERATED by scripts/sync-hero-generator.mjs from KingdomStudiosIO/hero-generator@${commit.slice(0, 7)}. Do not edit by hand.
import type { GeneratorArt } from '../renderer/generatorTypes'

export const HERO_GENERATOR: GeneratorArt = ${JSON.stringify(data, null, 1)}\n`
)
console.log(
  `wrote ${path.relative(ROOT, OUT)}: ${Object.keys(armor.male).length} armor looks, ${Object.keys(accessories.male).length} accessory looks, ${
    Object.values(weaponRules).flatMap(Object.keys).length
  } weapon rules`
)
fs.rmSync(path.dirname(tmp), { recursive: true, force: true })
