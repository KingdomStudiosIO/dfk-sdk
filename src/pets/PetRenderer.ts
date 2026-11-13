import type { AssetConfig } from '../config'
import { PET_FPS, PET_SCENE_FRAME_SIZE, PET_SPRITE_FRAME_WIDTH } from './constants'
import { getPetCardArt, getPetSpriteUrl } from './images'
import type { Pet } from './types'

export type RenderablePet = Pick<Pet, 'species' | 'rarity' | 'backgroundId' | 'element'>

export interface PetRendererOptions {
  /** Draw the pet's animated scenery behind and in front of it, like the game's cards. */
  scene?: boolean
  /** Frames per second (the game plays pets at 10). */
  fps?: number
  /** Mirror horizontally. */
  flip?: boolean
  /** Start the render loop automatically (default true). Set false to drive `tick()` yourself. */
  autoplay?: boolean
  assets?: Partial<AssetConfig>
}

const imageCache = new Map<string, Promise<HTMLImageElement>>()
function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(url)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load ${url}`))
      img.src = url
    })
    pending.catch(() => imageCache.delete(url))
    imageCache.set(url, pending)
  }
  return pending
}

/**
 * Plays a pet's sprite-sheet idle animation on a 2D canvas, pixel-perfect at any canvas size.
 * Has no dependencies, so it works in any framework or game engine.
 *
 * ```ts
 * const renderer = new PetRenderer(canvas, pet, { scene: true })
 * await renderer.ready
 * ```
 */
export class PetRenderer {
  readonly ready: Promise<void>
  frame = 0

  private readonly context: CanvasRenderingContext2D
  private readonly options: Required<Omit<PetRendererOptions, 'assets'>> & PetRendererOptions
  private images: { pet?: HTMLImageElement; bg?: HTMLImageElement; fg?: HTMLImageElement } = {}
  private elapsed = 0
  private lastTime = 0
  private raf: number | null = null
  private destroyed = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pet: RenderablePet,
    options: PetRendererOptions = {}
  ) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PetRenderer needs a canvas with a 2D context')
    this.context = context
    this.options = { scene: false, fps: PET_FPS, flip: false, autoplay: true, ...options }
    this.ready = this.load()
  }

  /** Number of frames in the pet's sprite sheet (0 until loaded). */
  get frameCount(): number {
    return this.images.pet ? Math.max(1, Math.floor(this.images.pet.width / PET_SPRITE_FRAME_WIDTH)) : 0
  }

  pause(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }

  resume(): void {
    if (this.raf !== null || this.destroyed) return
    this.lastTime = performance.now()
    const loop = (now: number) => {
      this.tick((now - this.lastTime) / 1000)
      this.lastTime = now
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  /** Advances the animation by `delta` seconds and draws a frame. */
  tick(delta: number): void {
    if (!this.images.pet) return
    this.elapsed += delta
    const step = 1 / this.options.fps
    while (this.elapsed >= step) {
      this.elapsed -= step
      this.frame++
    }
    this.draw()
  }

  destroy(): void {
    this.destroyed = true
    this.pause()
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private draw(): void {
    const { canvas, context, images } = this
    const pet = images.pet!
    const extra = Math.max(0, pet.height - PET_SPRITE_FRAME_WIDTH) // tall sprites overflow upwards
    const scene = this.options.scene && images.bg && images.fg
    // Logical size of what we draw, before scaling to the canvas.
    const logicalW = scene ? PET_SCENE_FRAME_SIZE : PET_SPRITE_FRAME_WIDTH
    const logicalH = scene ? PET_SCENE_FRAME_SIZE : PET_SPRITE_FRAME_WIDTH + extra

    const ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
    const width = Math.round(canvas.clientWidth * ratio) || canvas.width
    const height = Math.round(canvas.clientHeight * ratio) || canvas.height
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    // Integer scaling keeps pixel art crisp; fall back to fractional on tiny canvases.
    const fit = Math.min(width / logicalW, height / logicalH)
    const scale = fit >= 1 ? Math.floor(fit) : fit

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = false
    context.translate(Math.round((width - logicalW * scale) / 2), Math.round((height - logicalH * scale) / 2))
    if (this.options.flip) {
      context.translate(logicalW * scale, 0)
      context.scale(-scale, scale)
    } else {
      context.scale(scale, scale)
    }

    const petFrame = this.frame % this.frameCount
    if (scene) {
      const s = PET_SCENE_FRAME_SIZE
      const bgFrames = Math.max(1, Math.floor(images.bg!.width / s))
      const fgFrames = Math.max(1, Math.floor(images.fg!.width / s))
      context.drawImage(images.bg!, (this.frame % bgFrames) * s, 0, s, s, 0, 0, s, s)
      context.drawImage(images.fg!, (this.frame % fgFrames) * s, 0, s, s, 0, 0, s, s)
      // Same placement as the game's card renderer.
      context.drawImage(pet, petFrame * 72, 0, 72, 72 + extra, 10, 22 - extra, 72, 72 + extra)
    } else {
      context.drawImage(pet, petFrame * 72, 0, 72, 72 + extra, 0, 0, 72, 72 + extra)
    }
  }

  private async load(): Promise<void> {
    const spriteUrl = getPetSpriteUrl(this.pet, this.options.assets)
    if (!spriteUrl) throw new Error('This pet has no known appearance to render')
    const art = this.options.scene ? getPetCardArt(this.pet, this.options.assets) : undefined
    const [pet, bg, fg] = await Promise.all([
      loadImage(spriteUrl),
      art ? loadImage(art.sceneBackground).catch(() => undefined) : undefined,
      art ? loadImage(art.sceneForeground).catch(() => undefined) : undefined,
    ])
    if (this.destroyed) return
    this.images = { pet, bg, fg }
    this.draw()
    if (this.options.autoplay) this.resume()
  }
}
