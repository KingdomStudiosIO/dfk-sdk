import { useEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react'
import type { Equipment } from '../equipment/types'
import { createHeroCard, type HeroCardHandle, type HeroCardPage } from '../heroes/card'
import { renderClassicHero } from '../heroes/classic'
import { RARITY_COLORS, STAT_ABBREVIATIONS, STAT_KEYS } from '../heroes/constants'
import { PetRenderer, type PetRendererOptions, type RenderablePet } from '../pets/PetRenderer'
import type { Pet, PetBonus } from '../pets/types'
import type { Hero } from '../heroes/types'
import type { ItemDefinition } from '../items/types'
import type { HeroRenderer, HeroRendererOptions, RenderableHero } from '../renderer/HeroRenderer'
import type { HeroLookGear } from '../renderer/heroAtlas'
import type { TokenDefinition } from '../tokens'
import { useDFK } from './context'

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>

export interface HeroImageProps extends ImgProps {
  hero: Pick<Hero, 'id' | 'equipment' | 'name' | 'class' | 'visualGenes'>
  /**
   * Both are drawn in the browser from the hero's genes.
   * `classic` (default): the game client's pixel-art view.
   * `generator`: the hero generator's art, as its service drew hero images for the game; shows
   * the equipped armor and accessory from `gear`.
   */
  source?: 'classic' | 'generator'
  /** Equipped gear for `source: 'generator'` (`await dfk.equipment.forHero(hero)`). */
  gear?: HeroLookGear | null
}

/** Static full-body hero portrait. */
export function HeroImage({ hero, alt, source = 'classic', gear, ...img }: HeroImageProps) {
  const client = useDFK()
  const [src, setSrc] = useState<string>()
  const genesKey = JSON.stringify(hero.visualGenes?.raw ?? null)
  const gearKey = JSON.stringify(
    [gear?.armor, gear?.armorVisage, gear?.accessory, gear?.accessoryVisage].map(e => e && [e.typeId, e.displayId, e.dyes])
  )

  useEffect(() => {
    let cancelled = false
    if (!hero.visualGenes) return setSrc(undefined)
    const input = { class: hero.class, visualGenes: hero.visualGenes, gear }
    const options = { scale: 4, assets: client.assets }
    // The generator's art is loaded only when asked for, like the animated renderer.
    const render =
      source === 'generator'
        ? import('../renderer/generatorAtlas').then(m => m.renderGeneratorHero(input, options))
        : renderClassicHero(input, options)
    render.then(
      canvas => !cancelled && setSrc(canvas.toDataURL()),
      () => !cancelled && setSrc(undefined)
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, hero.class, genesKey, gearKey])

  if (!src) return null
  return <img src={src} alt={alt ?? hero.name} loading="lazy" style={{ imageRendering: 'pixelated', ...img.style }} {...img} />
}

export interface AnimatedHeroProps extends HeroRendererOptions {
  hero: RenderableHero
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
  /** Receives the renderer once loaded, for playing other animations. */
  onReady?: (renderer: HeroRenderer) => void
  onError?: (error: Error) => void
}

/**
 * Animated hero, drawn with the game's hero rig. The renderer code is only loaded when this
 * component mounts.
 */
export function AnimatedHero({ hero, width = 228, height = 212, className, style, onReady, onError, ...options }: AnimatedHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const client = useDFK()
  const callbacks = useRef({ onReady, onError })
  callbacks.current = { onReady, onError }
  // Bigints (e.g. sale prices on equipped gear) are not JSON-serializable.
  const optionsKey = JSON.stringify(options, (_, v) => (typeof v === 'bigint' ? v.toString() : v))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: HeroRenderer | undefined
    let cancelled = false
    import('../renderer/HeroRenderer')
      .then(({ HeroRenderer }) => {
        if (cancelled) return
        renderer = new HeroRenderer(canvas, { ...hero, chainId: hero.chainId ?? client.chainId }, options)
        return renderer.ready.then(() => !cancelled && callbacks.current.onReady?.(renderer!))
      })
      .catch(err => !cancelled && callbacks.current.onError?.(err instanceof Error ? err : new Error(String(err))))
    return () => {
      cancelled = true
      renderer?.destroy()
    }
    // The renderer only depends on what's drawn: the hero, its gear, and the options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.id, hero.chainId, hero.gender, hero.class, JSON.stringify(hero.equipment ?? null), client.chainId, optionsKey])

  return <canvas ref={canvasRef} className={className} style={{ width, height, imageRendering: 'pixelated', ...style }} />
}

export function ItemIcon({ item, size = 32, alt, ...img }: { item: ItemDefinition; size?: number } & ImgProps) {
  const client = useDFK()
  return (
    <img
      src={client.items.imageUrl(item)}
      alt={alt ?? item.name}
      width={size}
      height={size}
      loading="lazy"
      style={{ imageRendering: 'pixelated', ...img.style }}
      {...img}
    />
  )
}

export function TokenIcon({ token, size = 24, alt, ...img }: { token: TokenDefinition; size?: number } & ImgProps) {
  return <img src={token.logo} alt={alt ?? token.symbol} width={size} height={size} loading="lazy" {...img} />
}

export interface HeroCardProps {
  hero: Hero
  /** Animate the hero with the game's hero rig (loads the renderer lazily). Default false: classic art. */
  animated?: boolean
  /** Controlled flip state. Leave undefined to let clicks flip the card. */
  flipped?: boolean
  /** Back page to show. */
  page?: HeroCardPage
  /** Called when the card is clicked (it flips itself unless `flipped` is controlled). */
  onFlip?: (flipped: boolean) => void
  /** Owner name for the stats page. */
  ownerName?: string
  /** The game's ornate outer border. */
  border?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * The game's hero card: the hero on its background scene with rarity frame, vitals and bars on
 * the front; stats, growth, genes and history on the back. Uses the game's own stylesheet,
 * injected once per page.
 */
export function HeroCard({ hero, animated = false, flipped, page, onFlip, ownerName, border, className, style }: HeroCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const client = useDFK()
  const handleRef = useRef<HeroCardHandle>()
  const onFlipRef = useRef(onFlip)
  onFlipRef.current = onFlip
  const controlled = flipped !== undefined

  useEffect(() => {
    const host = ref.current
    if (!host) return
    let cancelled = false
    let handle: HeroCardHandle | undefined
    const options = { flipped, page, ownerName, border, flipOnClick: false, assets: client.assets }
    const mount = (h: HeroCardHandle) => {
      if (cancelled) return h.destroy()
      handle = handleRef.current = h
      host.replaceChildren(h.element)
      h.element.addEventListener('click', () => {
        const next = !h.flipped
        if (!controlledRef.current) h.flip(next)
        onFlipRef.current?.(next)
      })
    }
    if (animated) import('../renderer/heroCard').then(m => mount(m.createAnimatedHeroCard(hero, options)))
    else mount(createHeroCard(hero, options))
    return () => {
      cancelled = true
      handle?.destroy()
      handleRef.current = undefined
    }
    // Rebuild only when what's drawn changes; flip and page are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero, animated, ownerName, border, client])

  const controlledRef = useRef(controlled)
  controlledRef.current = controlled
  useEffect(() => {
    if (controlled) handleRef.current?.flip(flipped)
  }, [controlled, flipped])
  useEffect(() => {
    if (page) handleRef.current?.setPage(page)
  }, [page])

  return <div ref={ref} className={className} style={style} />
}

export interface CompactHeroCardProps {
  hero: Hero
  /** Show the animated hero instead of the static portrait. */
  animated?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * A compact, unopinionated hero card. Colors come from CSS variables so it can be themed:
 * `--dfk-card-bg`, `--dfk-card-fg`, `--dfk-card-muted`, `--dfk-card-border`.
 */
export function CompactHeroCard({ hero, animated = false, className, style }: CompactHeroCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const rarityColor = RARITY_COLORS[hero.rarity]
  const muted = 'var(--dfk-card-muted, #9a8f7a)'

  return (
    <div
      className={className}
      style={{
        width: 240,
        borderRadius: 12,
        padding: 12,
        background: 'var(--dfk-card-bg, #1d1a16)',
        color: 'var(--dfk-card-fg, #f3ead8)',
        border: `2px solid ${hero.rarity === 'common' ? 'var(--dfk-card-border, #3a342b)' : rarityColor}`,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hero.name}</strong>
        <span style={{ color: muted }}>#{hero.displayId}</span>
      </div>
      <div style={{ color: rarityColor, textTransform: 'capitalize', marginTop: 2 }}>
        {hero.shiny ? '✦ ' : ''}
        {hero.rarity} · Gen {hero.generation}
      </div>

      <div style={{ height: 212, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
        {animated ? (
          <AnimatedHero hero={hero} />
        ) : imageFailed ? (
          <span style={{ color: muted, alignSelf: 'center' }}>No portrait</span>
        ) : (
          <HeroImage hero={hero} onError={() => setImageFailed(true)} style={{ width: 177 }} />
        )}
      </div>

      <div style={{ textTransform: 'capitalize' }}>
        Lv {hero.level} {hero.class}
        {hero.subClass ? <span style={{ color: muted }}> / {hero.subClass}</span> : null}
      </div>
      <div style={{ color: muted, textTransform: 'capitalize', marginBottom: 8 }}>
        {[hero.element, hero.profession, hero.originRealm].filter(Boolean).join(' · ')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
        {STAT_KEYS.map(key => (
          <div key={key}>
            <div style={{ color: muted, fontSize: 11 }}>{STAT_ABBREVIATIONS[key]}</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{hero.stats[key]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: muted, fontVariantNumeric: 'tabular-nums' }}>
        <span>HP {hero.stats.hp}</span>
        <span>MP {hero.stats.mp}</span>
        <span>STA {hero.stats.stamina}</span>
      </div>
    </div>
  )
}

export interface PetSpriteProps extends PetRendererOptions {
  pet: RenderablePet
  /** CSS size of the canvas. The sprite is scaled by whole pixels to fit. */
  size?: number
  className?: string
  style?: CSSProperties
  onReady?: (renderer: PetRenderer) => void
  onError?: (error: Error) => void
}

/** Animated pet from its sprite sheet. No extra dependencies. */
export function PetSprite({ pet, size = 144, className, style, onReady, onError, ...options }: PetSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const client = useDFK()
  const callbacks = useRef({ onReady, onError })
  callbacks.current = { onReady, onError }
  // Bigints (e.g. sale prices on equipped gear) are not JSON-serializable.
  const optionsKey = JSON.stringify(options, (_, v) => (typeof v === 'bigint' ? v.toString() : v))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const renderer = new PetRenderer(canvas, pet, { assets: client.assets, ...options })
    renderer.ready.then(
      () => !cancelled && callbacks.current.onReady?.(renderer),
      err => !cancelled && callbacks.current.onError?.(err instanceof Error ? err : new Error(String(err)))
    )
    return () => {
      cancelled = true
      renderer.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.species?.sprite, pet.backgroundId, pet.rarity, pet.element, optionsKey])

  return <canvas ref={canvasRef} className={className} style={{ width: size, height: size, imageRendering: 'pixelated', ...style }} />
}

const BONUS_STARS = ['', '★', '★★', '★★★']

function BonusLine({ bonus, muted }: { bonus: PetBonus | null; muted: string }) {
  if (!bonus) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span>{bonus.revealed ? bonus.name : `Unrevealed ${bonus.kind}`}</span>
      <span style={{ color: muted }}>{BONUS_STARS[bonus.tier]}</span>
    </div>
  )
}

export interface PetCardProps {
  pet: Pet
  /** Draw the pet's animated scenery (default true). */
  scene?: boolean
  className?: string
  style?: CSSProperties
}

/** A compact pet card, themed with the same CSS variables as `HeroCard`. */
export function PetCard({ pet, scene = true, className, style }: PetCardProps) {
  const rarityColor = RARITY_COLORS[pet.rarity]
  const muted = 'var(--dfk-card-muted, #9a8f7a)'
  return (
    <div
      className={className}
      style={{
        width: 240,
        borderRadius: 12,
        padding: 12,
        background: 'var(--dfk-card-bg, #1d1a16)',
        color: 'var(--dfk-card-fg, #f3ead8)',
        border: `2px solid ${pet.rarity === 'common' ? 'var(--dfk-card-border, #3a342b)' : rarityColor}`,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.name}</strong>
        <span style={{ color: muted }}>#{pet.displayId}</span>
      </div>
      <div style={{ color: rarityColor, textTransform: 'capitalize', marginTop: 2 }}>
        {pet.shiny ? '✦ ' : ''}
        {pet.rarity} · {pet.species?.variant ?? pet.eggType}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        {pet.species ? <PetSprite pet={pet} scene={scene} size={180} /> : <span style={{ color: muted }}>No sprite</span>}
      </div>
      <div style={{ color: muted, textTransform: 'capitalize', marginBottom: 6 }}>
        {[pet.element, pet.profession, pet.background].join(' · ')}
      </div>
      <BonusLine bonus={pet.gathering} muted={muted} />
      <BonusLine bonus={pet.crafting} muted={muted} />
      <BonusLine bonus={pet.combat} muted={muted} />
    </div>
  )
}

/** An equipment icon from the game's art CDN, with the item's name as alt text. */
export function EquipmentIcon({
  item,
  size = 48,
  alt,
  ...img
}: { item: Pick<Equipment, 'kind' | 'typeId' | 'displayId' | 'name'>; size?: number } & ImgProps) {
  const client = useDFK()
  return (
    <img
      src={client.equipment.imageUrl(item)}
      alt={alt ?? item.name}
      width={size}
      height={size}
      loading="lazy"
      style={{ imageRendering: 'pixelated', ...img.style }}
      {...img}
    />
  )
}
