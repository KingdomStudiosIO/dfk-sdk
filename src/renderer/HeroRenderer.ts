import type { AssetConfig } from '../config'
import { getDefaultHeroAnimation } from '../heroes/animations'
import { getHeroRigUrl } from '../heroes/images'
import type { Hero } from '../heroes/types'
import { buildGeneratorHeroAtlas } from './generatorAtlas'
import { buildHeroAtlas, type HeroLookGear } from './heroAtlas'
import type { RigAtlas } from './rig/atlas'
import {
  emptyPose,
  frameAt,
  getLoadedAnimation,
  loadBakedAnimation,
  loadBakedRig,
  poseAt,
  type BakedAnimation,
  type BakedRig,
  type Pose,
  type RigEvent,
} from './rig/baked'
import { drawRig, extractRegion, findAttachment } from './rig/draw'
import { RigPlayer } from './rig/player'

export type RenderableHero = Pick<Hero, 'id' | 'chainId' | 'gender' | 'class'> &
  Partial<Pick<Hero, 'equipment' | 'visualGenes'>>

/**
 * The pose about to be drawn, handed to `onPose`. Changes apply to that frame only: every frame
 * starts again from the animation's own pose, with `images` all null.
 */
export interface HeroPose {
  /** Slot names, by slot index (fixed for the rig). */
  readonly slots: readonly string[]
  /** Attachment shown in each slot; set null to hide a slot. */
  attachments: (string | null)[]
  /** Slot indices in draw order; may be rewritten in place. */
  drawOrder: number[]
  /**
   * Per-slot picture drawn instead of the attachment's own, placed and sized like the
   * attachment's full image (as `attachmentImage` returns it). The slot must still show an
   * attachment. Reset to all null every frame.
   */
  images: (CanvasImageSource | null)[]
}

export interface HeroRendererOptions {
  /** Animation to loop once loaded. Defaults to the class's idle stance. */
  animation?: string
  /** Seconds to blend between animations. */
  mix?: number
  /** Multiplier on the fitted size; the game uses 1.8 on its hero cards. */
  zoom?: number
  /** Face left instead of right. */
  flip?: boolean
  /** Start the render loop automatically (default true). Set false to drive `tick()` yourself. */
  autoplay?: boolean
  /**
   * Where the hero's art comes from. Both are built in the browser from the hero's genes, so they
   * need `hero.visualGenes`.
   * - `local` (default): the game client's classic layers. Shows class clothing, plus the
   *   equipped weapon and shield when `gear` is given.
   * - `generator`: the DFK hero generator's art, as the hero generator service drew it for the
   *   game. Also shows equipped armor and accessories (helms, masks, crowns) when `gear` is given.
   * - `auto`: the same as `generator` (it used to try the retired generator service first).
   */
  source?: 'local' | 'generator' | 'auto'
  /** Draw this atlas instead of building one (from `buildHeroAtlas`, `buildGeneratorHeroAtlas` or your own art). */
  atlas?: RigAtlas
  /**
   * The hero's equipped gear (`await dfk.equipment.forHero(hero)`). Its weapon (or weapon visage)
   * and shield are drawn in the hero's hands, and the default animations switch to the equipped
   * weapon's set, as in combat. With `source: 'generator'`, its armor and accessory show too.
   * Without it heroes wear their class clothing and hold their class's default weapon.
   */
  gear?: HeroLookGear | null
  /** Called for each event keyed in an animation, e.g. `hit` when an attack lands. */
  onEvent?: (event: RigEvent, animation: string) => void
  /**
   * Called with each pose after it's worked out and before it's drawn, by `tick()` and
   * `renderAt()`. Hide slots, reorder them or swap in pictures; see `HeroPose`.
   */
  onPose?: (pose: HeroPose) => void
  assets?: Partial<AssetConfig>
}

/**
 * Draws an animated hero onto a 2D canvas using the game's hero rig.
 *
 * Animations are loaded the first time they're played (a few KB each); `preload` fetches them
 * ahead of time. Until a requested animation arrives, the previous one keeps playing.
 *
 * ```ts
 * const renderer = new HeroRenderer(canvas, hero)
 * await renderer.ready
 * renderer.play(professionAnimation('fishing'))
 * ```
 */
export class HeroRenderer {
  readonly ready: Promise<void>

  private rig: BakedRig | null = null
  private rigUrl: string
  private player: RigPlayer | null = null
  private atlas: RigAtlas | null = null
  private skin = 'MALE'
  /** Bumped by every play request, so a slow load can't override a later request. */
  private request = 0
  private readonly context: CanvasRenderingContext2D
  private lastTime = 0
  private frame: number | null = null
  private destroyed = false
  /** What `onPose` sees and `drawRig` draws: a per-renderer copy, never the player's or the rig's. */
  private heroPose: HeroPose | null = null
  /** Scratch pose for `renderAt`, so it never touches the player's. */
  private stillPose: Pose | null = null
  private readonly options: Required<Omit<HeroRendererOptions, 'animation' | 'assets' | 'source' | 'atlas' | 'onEvent' | 'onPose' | 'gear'>> &
    HeroRendererOptions

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hero: RenderableHero,
    options: HeroRendererOptions = {}
  ) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('HeroRenderer needs a canvas with a 2D context')
    this.context = context
    this.options = { mix: 0.2, zoom: 1.8, flip: false, autoplay: true, ...options }
    this.rigUrl = getHeroRigUrl(this.options.assets)
    this.ready = this.load()
  }

  /** Every animation name in the rig. */
  get animations(): string[] {
    return this.rig ? this.rig.animations.map(a => a.name) : []
  }

  /** The animation playing (or fading in), if any. */
  get animation(): string | undefined {
    return this.player?.animation
  }

  /** Seconds to crossfade between animations. */
  get mix(): number {
    return this.player?.mix ?? this.options.mix
  }
  set mix(seconds: number) {
    this.options.mix = seconds
    if (this.player) this.player.mix = seconds
  }

  /** An animation's length in seconds; 0 for an unknown name, or before `ready`. */
  duration(name: string): number {
    return this.rig?.animations.find(a => a.name === name)?.duration ?? 0
  }

  /** Fetches animations ahead of time so playing them starts instantly. */
  async preload(...animations: string[]): Promise<void> {
    const rig = await this.whenRig()
    await Promise.all(animations.map(a => loadBakedAnimation(rig, this.rigUrl, a)))
  }

  /** Switches to `animation`. Resolves once it's playing (immediately if already loaded). */
  play(animation: string, { loop = true }: { loop?: boolean } = {}): Promise<void> {
    this.check(animation)
    const request = ++this.request
    return this.loadAnimation(animation).then(a => {
      if (request === this.request && !this.destroyed) this.player!.set(a, loop)
    })
  }

  /** Plays an animation once, then returns to `then` (default: the idle stance). */
  playOnce(animation: string, then = this.options.animation ?? getDefaultHeroAnimation(this.hero, this.options.gear)): Promise<void> {
    this.check(animation)
    this.check(then)
    const request = ++this.request
    return Promise.all([this.loadAnimation(animation), this.loadAnimation(then)]).then(([once, next]) => {
      if (request !== this.request || this.destroyed) return
      this.player!.set(once, false)
      this.player!.add(next, true)
    })
  }

  pause(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  resume(): void {
    if (this.frame !== null || this.destroyed) return
    this.lastTime = performance.now()
    const loop = (now: number) => {
      this.tick((now - this.lastTime) / 1000)
      this.lastTime = now
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  /** Advances the animation by `delta` seconds and draws one frame. */
  tick(delta: number): void {
    const { rig, player, atlas } = this
    if (!rig || !player || !atlas) return
    this.clear()
    player.update(delta)
    const pose = player.apply()
    if (pose) this.drawPose(pose)
  }

  /**
   * Draws `animation` exactly `time` seconds in, right away: no crossfade, and no events fired.
   * Looping animations (the default) wrap the time; one-shots (`loop: false`) clamp it. The hero
   * is fitted as `tick()` fits it. The normal player isn't touched, so a later `tick()` or
   * `play()` carries on as before; pass `autoplay: false` so the render loop doesn't draw over it.
   *
   * The animation must already be loaded: `await renderer.preload(...names)` first.
   */
  renderAt(animation: string, time: number, { loop = true }: { loop?: boolean } = {}): void {
    this.check(animation)
    const rig = this.rig!
    const baked = getLoadedAnimation(rig, animation)
    if (!baked) throw new Error(`Hero animation "${animation}" isn't loaded; await renderer.preload("${animation}") before renderAt`)
    const d = baked.duration
    const t = loop && d > 0 ? ((time % d) + d) % d : Math.max(0, Math.min(time, d))
    const pose = (this.stillPose ??= emptyPose(rig))
    poseAt(rig, baked, frameAt(rig, baked, t, loop), pose)
    this.clear()
    this.drawPose(pose)
  }

  /**
   * A copy of the picture an attachment draws in this hero's atlas, at its original (untrimmed)
   * size, e.g. the head or body to paint a back view from. `attachment` defaults to the slot's
   * setup attachment. Null when the slot or attachment doesn't exist. Needs `ready`.
   */
  attachmentImage(slot: string, attachment?: string): HTMLCanvasElement | null {
    if (!this.rig || !this.atlas) throw new Error('HeroRenderer is not ready; await renderer.ready first')
    const index = this.rig.slots.findIndex(s => s.name === slot)
    if (index < 0) return null
    const name = attachment ?? this.rig.slots[index].attachment
    if (!name) return null
    const att = findAttachment(this.rig, this.skin, index, name)
    const region = att && this.atlas.regions.get(att.region)
    if (!region) return null
    return extractRegion(this.atlas, region, document.createElement('canvas'))
  }

  /** Sizes the canvas to its displayed size and clears it. */
  private clear(): void {
    const { canvas, context } = this
    const ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
    const width = Math.round(canvas.clientWidth * ratio) || canvas.width
    const height = Math.round(canvas.clientHeight * ratio) || canvas.height
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = false
  }

  /** Hands the pose to `onPose` (as a copy), then draws it fitted to the canvas. */
  private drawPose(pose: Pose): void {
    const rig = this.rig!
    const { canvas, context } = this
    let draw: Pose = pose
    let images: (CanvasImageSource | null)[] | undefined
    if (this.options.onPose) {
      const hero = (this.heroPose ??= {
        slots: Object.freeze(rig.slots.map(s => s.name)),
        attachments: [],
        drawOrder: [],
        images: [],
      })
      hero.attachments.length = 0
      hero.attachments.push(...pose.attachments)
      hero.drawOrder.length = 0
      hero.drawOrder.push(...pose.drawOrder)
      hero.images.length = 0
      for (let i = 0; i < rig.slots.length; i++) hero.images.push(null)
      this.options.onPose(hero)
      draw = { world: pose.world, attachments: hero.attachments, drawOrder: hero.drawOrder }
      images = hero.images
    }

    // Feet at 93% of the height, centered; the rig is y-up, the canvas y-down.
    const bounds = rig.bounds[this.skin] ?? rig.bounds.MALE
    const scale = (canvas.height / bounds.height) * this.options.zoom
    context.setTransform(this.options.flip ? -scale : scale, 0, 0, -scale, canvas.width / 2, canvas.height * 0.93)
    drawRig(context, rig, draw, this.atlas!, this.skin, images)
    context.setTransform(1, 0, 0, 1, 0, 0)
  }

  destroy(): void {
    this.destroyed = true
    this.pause()
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** Throws right away for names the rig doesn't have (once the rig is loaded). */
  private check(animation: string): void {
    if (!this.player) throw new Error('HeroRenderer is not ready; await renderer.ready first')
    if (!this.rig!.animations.some(a => a.name === animation)) throw new Error(`Unknown hero animation "${animation}"`)
  }

  private rigPromise: Promise<BakedRig> | null = null
  private whenRig(): Promise<BakedRig> {
    return (this.rigPromise ??= loadBakedRig(this.rigUrl))
  }

  private async loadAnimation(animation: string): Promise<BakedAnimation> {
    const rig = await this.whenRig()
    return loadBakedAnimation(rig, this.rigUrl, animation)
  }

  private async load(): Promise<void> {
    const first = this.options.animation ?? getDefaultHeroAnimation(this.hero, this.options.gear)
    const rig = await this.whenRig()
    const [atlas, animation] = await Promise.all([this.loadAtlas(), loadBakedAnimation(rig, this.rigUrl, first)])
    if (this.destroyed || !atlas) return

    this.rig = rig
    this.atlas = atlas
    this.skin = this.hero.gender === 'female' ? 'FEMALE' : 'MALE'
    this.player = new RigPlayer(rig, this.options.mix)
    this.player.onEvent = this.options.onEvent
    this.player.set(animation, true)
    if (this.options.autoplay) this.resume()
  }

  private async loadAtlas(): Promise<RigAtlas> {
    if (this.options.atlas) return this.options.atlas
    const { visualGenes, class: heroClass } = this.hero
    if (!visualGenes) throw new Error('Rendering a hero needs its visualGenes (any Hero from the SDK has them)')
    const input = { class: heroClass, visualGenes, gear: this.options.gear }
    const source = this.options.source ?? 'local'
    return source === 'local' ? buildHeroAtlas(input, this.options.assets) : buildGeneratorHeroAtlas(input, this.options.assets)
  }
}
