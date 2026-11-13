/**
 * The hero rig as baked frames (`hero-rig/baked/`, generated from the game's rig export).
 *
 * Each animation stores every bone's world transform at a fixed frame rate, plus which image each
 * slot shows and the slots' draw order. Playing it is a lookup: no skeleton is solved at runtime.
 */

/** An image placed in a bone's space. `region` names the atlas region it draws. */
export interface RegionAttachment {
  region: string
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  width: number
  height: number
}

export interface RigEvent {
  time: number
  name: string
  int?: number
  float?: number
  string?: string
}

export interface RigBounds {
  x: number
  y: number
  width: number
  height: number
}

/** `rig.json`: the rig's structure and its list of animations. */
export interface BakedRig {
  version: 1
  fps: number
  matrixScale: number
  positionScale: number
  bones: string[]
  slots: { name: string; bone: number; attachment: string | null }[]
  /** skin -> slot index -> attachment name -> attachment. */
  skins: Record<string, Record<string, Record<string, RegionAttachment>>>
  /** The setup pose's bounds per skin, in rig units (y up). */
  bounds: Record<string, RigBounds>
  animations: { name: string; file: string; duration: number; frames: number }[]
}

interface BakedAnimationFile {
  name: string
  frames: number
  /**
   * Fixed-point bone transforms, frame-to-frame deltas: (frames + 1) × bones × (a, b, c, d, x, y).
   * The extra frame is the pose just before the end, for loops.
   */
  bones: number[]
  /** [frame, slot, attachment or null] whenever a slot's image changes. */
  attachments: [number, number, string | null][]
  /** [frame, slot indices in draw order] whenever the order changes. */
  drawOrder: [number, number[]][]
  events: RigEvent[]
}

export interface BakedAnimation {
  name: string
  duration: number
  /** Regular frames; `world` holds one more (the loop-end pose). */
  frames: number
  /** Bone world transforms, (frames + 1) × bones × (a, b, c, d, x, y), y up. */
  world: Float32Array
  attachments: [number, number, string | null][]
  drawOrder: [number, number[]][]
  events: RigEvent[]
}

/** One moment of the rig: bone world transforms, slot images and draw order. */
export interface Pose {
  world: Float32Array
  attachments: (string | null)[]
  drawOrder: number[]
}

export const WORLD_STRIDE = 6

export function decodeAnimation(rig: BakedRig, file: BakedAnimationFile, duration: number): BakedAnimation {
  const stride = rig.bones.length * WORLD_STRIDE
  if (file.bones.length !== (file.frames + 1) * stride) throw new Error(`Baked animation "${file.name}" has the wrong amount of data`)
  const world = new Float32Array(file.bones.length)
  const running = new Float64Array(stride)
  for (let i = 0; i < file.bones.length; i++) {
    const j = i % stride
    running[j] += file.bones[i]
    world[i] = running[j] / (j % WORLD_STRIDE < 4 ? rig.matrixScale : rig.positionScale)
  }
  return { name: file.name, duration, frames: file.frames, world, attachments: file.attachments, drawOrder: file.drawOrder, events: file.events }
}

export function emptyPose(rig: BakedRig): Pose {
  return {
    world: new Float32Array(rig.bones.length * WORLD_STRIDE),
    attachments: rig.slots.map(s => s.attachment),
    drawOrder: rig.slots.map((_, i) => i),
  }
}

/**
 * Frame shown at `time` seconds (already wrapped or clamped to the animation). The last regular
 * frame is the pose at the very end, which only a one-shot reaches; a looping animation shows the
 * extra frame after it (the pose just before the end) in its final instant instead.
 */
export function frameAt(rig: BakedRig, animation: BakedAnimation, time: number, loop = false): number {
  const frame = Math.max(0, Math.min(animation.frames - 1, Math.round(time * rig.fps)))
  const endsOnLastFrame = Math.abs((animation.frames - 1) / rig.fps - animation.duration) < 1e-4
  return loop && endsOnLastFrame && frame === animation.frames - 1 ? animation.frames : frame
}

/** Writes the animation's pose at `frame` into `out`. */
export function poseAt(rig: BakedRig, animation: BakedAnimation, frame: number, out: Pose): Pose {
  const stride = rig.bones.length * WORLD_STRIDE
  out.world.set(animation.world.subarray(frame * stride, (frame + 1) * stride))
  rig.slots.forEach((s, i) => {
    out.attachments[i] = s.attachment
    out.drawOrder[i] = i
  })
  for (const [f, slot, name] of animation.attachments) {
    if (f > frame) break
    out.attachments[slot] = name
  }
  let order: number[] | undefined
  for (const [f, o] of animation.drawOrder) {
    if (f > frame) break
    order = o
  }
  if (order) for (let i = 0; i < order.length; i++) out.drawOrder[i] = order[i]
  return out
}

const wrapAngle = (r: number) => r - 2 * Math.PI * Math.round(r / (2 * Math.PI))

/**
 * Blends `from` toward `to` by `alpha` (0 keeps `from`), writing into `from`. Each bone's
 * transform is split into position, the angle and length of each axis, and those are blended
 * (angles the short way round), so a turning limb rotates rather than shrinking through the fade.
 * Images and draw order switch to `to` at once.
 */
export function blendPoses(from: Pose, to: Pose, alpha: number): Pose {
  const a = from.world
  const b = to.world
  for (let o = 0; o < a.length; o += WORLD_STRIDE) {
    const xAngle = Math.atan2(a[o + 2], a[o])
    const yAngle = Math.atan2(a[o + 3], a[o + 1])
    const xLen = Math.hypot(a[o], a[o + 2])
    const yLen = Math.hypot(a[o + 1], a[o + 3])
    const rx = xAngle + wrapAngle(Math.atan2(b[o + 2], b[o]) - xAngle) * alpha
    const ry = yAngle + wrapAngle(Math.atan2(b[o + 3], b[o + 1]) - yAngle) * alpha
    const sx = xLen + (Math.hypot(b[o], b[o + 2]) - xLen) * alpha
    const sy = yLen + (Math.hypot(b[o + 1], b[o + 3]) - yLen) * alpha
    a[o] = Math.cos(rx) * sx
    a[o + 2] = Math.sin(rx) * sx
    a[o + 1] = Math.cos(ry) * sy
    a[o + 3] = Math.sin(ry) * sy
    a[o + 4] += (b[o + 4] - a[o + 4]) * alpha
    a[o + 5] += (b[o + 5] - a[o + 5]) * alpha
  }
  for (let i = 0; i < from.attachments.length; i++) from.attachments[i] = to.attachments[i]
  for (let i = 0; i < from.drawOrder.length; i++) from.drawOrder[i] = to.drawOrder[i]
  return from
}

const cache = new Map<string, Promise<unknown>>()
function fetchJson<T>(url: string, what: string): Promise<T> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${what} ${url}: ${r.status}`)
      return r.json()
    })
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending as Promise<T>
}

/** Loads `rig.json` (cached per URL). */
export async function loadBakedRig(url: string): Promise<BakedRig> {
  const rig = await fetchJson<BakedRig>(url, 'hero rig')
  if (rig.version !== 1) throw new Error(`Hero rig ${url} has unsupported version ${rig.version}`)
  return rig
}

/**
 * Makes `url` absolute so files beside it can be resolved with `new URL(file, base)`. A relative
 * URL (an asset base such as `/dfk-assets`) is resolved against the page, as `fetch` would.
 */
export function absoluteUrl(url: string): string {
  try {
    return new URL(url).href
  } catch {
    const base =
      (typeof document !== 'undefined' && document.baseURI) || (typeof location !== 'undefined' && location.href) || undefined
    if (!base) throw new Error(`Can't resolve the relative URL ${url} outside a browser; use an absolute asset base URL`)
    return new URL(url, base).href
  }
}

const decoded = new WeakMap<BakedRig, Map<string, Promise<BakedAnimation>>>()
const loaded = new WeakMap<BakedRig, Map<string, BakedAnimation>>()

/** Loads and decodes one animation (cached per rig). `rigUrl` is where `rig.json` came from. */
export function loadBakedAnimation(rig: BakedRig, rigUrl: string, name: string): Promise<BakedAnimation> {
  let byName = decoded.get(rig)
  if (!byName) decoded.set(rig, (byName = new Map()))
  let pending = byName.get(name)
  if (!pending) {
    const entry = rig.animations.find(a => a.name === name)
    if (!entry) return Promise.reject(new Error(`Unknown hero animation "${name}"`))
    const url = new URL(entry.file, absoluteUrl(rigUrl)).href
    pending = fetchJson<BakedAnimationFile>(url, 'hero animation').then(file => {
      const animation = decodeAnimation(rig, file, entry.duration)
      let done = loaded.get(rig)
      if (!done) loaded.set(rig, (done = new Map()))
      done.set(name, animation)
      return animation
    })
    pending.catch(() => byName!.delete(name))
    byName.set(name, pending)
  }
  return pending
}

/** An animation `loadBakedAnimation` has finished loading for this rig, if any. */
export function getLoadedAnimation(rig: BakedRig, name: string): BakedAnimation | undefined {
  return loaded.get(rig)?.get(name)
}
