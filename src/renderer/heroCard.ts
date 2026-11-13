import { createHeroCard, type HeroCardHandle, type HeroCardOptions } from '../heroes/card'
import type { Hero } from '../heroes/types'
import { HeroRenderer, type HeroRendererOptions } from './HeroRenderer'

/**
 * The game's hero card with the animated hero in its portrait frame, like the game's
 * hero hub. Accepts every `createHeroCard` option plus `renderer` options for the animation.
 */
export function createAnimatedHeroCard(
  hero: Hero,
  options: Omit<HeroCardOptions, 'portrait'> & { renderer?: HeroRendererOptions } = {}
): HeroCardHandle & { renderer: Promise<HeroRenderer> } {
  let resolveRenderer!: (r: HeroRenderer) => void
  const renderer = new Promise<HeroRenderer>(resolve => (resolveRenderer = resolve))
  const handle = createHeroCard(hero, {
    ...options,
    portrait: frame => {
      const canvas = frame.ownerDocument.createElement('canvas')
      // Same element the game's CanvasHero uses: 228x212, above the scene.
      canvas.className = 'dfk-c-heroCard dfk-c-loaded'
      canvas.style.cssText = 'position:relative;z-index:1;width:228px;height:212px'
      frame.append(canvas)
      const r = new HeroRenderer(canvas, hero, { assets: options.assets, ...options.renderer })
      resolveRenderer(r)
      return () => r.destroy()
    },
  })
  return Object.assign(handle, { renderer })
}
