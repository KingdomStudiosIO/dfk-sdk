import { name as pkgName, version as pkgVersion } from '../package.json'

/**
 * Where the SDK loads hosted art from. Every field can be overridden per client
 * (see `createDFKClient`) or globally with `configureAssets`.
 */
export interface AssetConfig {
  /** Hero generator service for mainnet chains (static portraits and per-hero rig atlases). */
  heroGeneratorUrl: string
  /** Hero generator service for testnet chains. */
  heroGeneratorTestnetUrl: string
  /**
   * Base URL of this package's `assets/` folder. Defaults to the jsDelivr mirror of the
   * published npm version, which serves with permissive CORS. Self-host by copying
   * `node_modules/@defikingdoms/game-sdk/assets` and pointing this at it.
   */
  assetsBaseUrl: string
  /**
   * Base URL the hero rig loads from (everything under `hero-rig/`: the baked animations, the
   * default atlas and the weapon cells). Defaults to `assetsBaseUrl`. Set it when several asset
   * folders (say, a recolored set of `hero-classic/` layers) should share one copy of the rig.
   */
  rigBaseUrl?: string
  /** The game's art CDN: pet sprite sheets, pet cards, and equipment icons. */
  artBaseUrl: string
}

export const DEFAULT_ASSETS: AssetConfig = {
  heroGeneratorUrl: 'https://heroes.defikingdoms.com',
  heroGeneratorTestnetUrl: 'https://testnet.heroes.defikingdoms.com',
  assetsBaseUrl: `https://cdn.jsdelivr.net/npm/${pkgName}@${pkgVersion}/assets`,
  artBaseUrl: 'https://defi-kingdoms.b-cdn.net/art-assets',
}

let globalAssets: AssetConfig = { ...DEFAULT_ASSETS }

export function configureAssets(overrides: Partial<AssetConfig>): void {
  globalAssets = { ...globalAssets, ...overrides }
}

export function getAssetConfig(overrides?: Partial<AssetConfig>): AssetConfig {
  return overrides ? { ...globalAssets, ...overrides } : globalAssets
}

/** The `hero-rig` folder's URL (no trailing slash): under `rigBaseUrl`, else `assetsBaseUrl`. */
export function getHeroRigBaseUrl(overrides?: Partial<AssetConfig>): string {
  const cfg = getAssetConfig(overrides)
  return `${(cfg.rigBaseUrl || cfg.assetsBaseUrl).replace(/\/$/, '')}/hero-rig`
}

export function getArtUrl(path: string, overrides?: Partial<AssetConfig>): string {
  return `${getAssetConfig(overrides).artBaseUrl.replace(/\/$/, '')}/${path}`
}

/** Resolves an `asset:<path>` reference from the generated catalogs to a full URL. */
export function resolveAssetUrl(ref: string, overrides?: Partial<AssetConfig>): string {
  if (!ref.startsWith('asset:')) return ref
  return `${getAssetConfig(overrides).assetsBaseUrl.replace(/\/$/, '')}/${ref.slice('asset:'.length)}`
}
