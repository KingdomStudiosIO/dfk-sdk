/**
 * Texture atlases: one or more page images plus where each named region sits on them. Reads the
 * plain-text `.atlas` format the hero rig (and the old hero generator) use.
 */

export type AtlasImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas

export interface AtlasRegion {
  page: number
  /** Where the packed pixels sit on the page. */
  x: number
  y: number
  width: number
  height: number
  /** Size before transparent edges were trimmed, and where the packed pixels sit within it (from the bottom left). */
  originalWidth: number
  originalHeight: number
  offsetX: number
  offsetY: number
}

export interface RigAtlas {
  pages: AtlasImage[]
  regions: Map<string, AtlasRegion>
}

export interface ParsedAtlas {
  /** Page image file names, relative to the atlas file. */
  pages: string[]
  regions: Map<string, AtlasRegion>
}

const ints = (value: string) => value.split(',').map(v => Number(v.trim()))

export function parseAtlas(text: string): ParsedAtlas {
  const pages: string[] = []
  const regions = new Map<string, AtlasRegion>()
  let region: AtlasRegion | undefined
  let pageStart = true

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      // A blank line ends a page; the next name starts a new one.
      pageStart = true
      region = undefined
      continue
    }
    const colon = line.indexOf(':')
    if (colon < 0) {
      if (pageStart) {
        pages.push(line)
        pageStart = false
        region = undefined
      } else {
        region = {
          page: pages.length - 1,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          originalWidth: 0,
          originalHeight: 0,
          offsetX: 0,
          offsetY: 0,
        }
        regions.set(line, region)
      }
      continue
    }
    if (!region) continue // page settings (size, format, filter, pma, …)
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    const v = ints(value)
    switch (key) {
      case 'bounds':
        ;[region.x, region.y, region.width, region.height] = v
        break
      case 'xy':
        ;[region.x, region.y] = v
        break
      case 'size':
        ;[region.width, region.height] = v
        break
      case 'offsets':
        ;[region.offsetX, region.offsetY, region.originalWidth, region.originalHeight] = v
        break
      case 'offset':
        ;[region.offsetX, region.offsetY] = v
        break
      case 'orig':
        ;[region.originalWidth, region.originalHeight] = v
        break
      case 'rotate':
        // Neither the rig's atlas nor the ones the SDK builds pack regions rotated.
        if (value !== 'false' && value !== '0') throw new Error(`Atlas region rotation "${value}" isn't supported`)
        break
    }
  }
  for (const r of regions.values()) {
    if (!r.originalWidth) r.originalWidth = r.width
    if (!r.originalHeight) r.originalHeight = r.height
  }
  return { pages, regions }
}
