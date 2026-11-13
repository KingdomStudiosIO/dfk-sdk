import type { AtlasRegion, RigAtlas } from './atlas'
import { WORLD_STRIDE, type BakedRig, type Pose, type RegionAttachment } from './baked'

const DEG = Math.PI / 180

/** Finds a slot's attachment in the skin, falling back to the default skin. */
export function findAttachment(rig: BakedRig, skin: string, slot: number, name: string): RegionAttachment | undefined {
  return rig.skins[skin]?.[slot]?.[name] ?? rig.skins.default?.[slot]?.[name]
}

/**
 * Draws every visible attachment in draw order. The context's current transform must map the
 * rig's space (y up) to the canvas.
 *
 * `images[slot]`, when set, is drawn instead of that slot's attachment, in the place and at the
 * size the attachment's full (untrimmed) image would take. The slot still needs an attachment.
 */
export function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: BakedRig,
  pose: Pose,
  atlas: RigAtlas,
  skin: string,
  images?: readonly (CanvasImageSource | null | undefined)[]
): void {
  const w = pose.world
  for (const slotIndex of pose.drawOrder) {
    const name = pose.attachments[slotIndex]
    if (!name) continue
    const att = findAttachment(rig, skin, slotIndex, name)
    if (!att) continue
    const image = images?.[slotIndex]
    const region = image ? undefined : atlas.regions.get(att.region)
    if (!image && !region) continue
    const o = rig.slots[slotIndex].bone * WORLD_STRIDE
    ctx.save()
    // The bone's world transform, then the image's place in the bone's space.
    ctx.transform(w[o], w[o + 2], w[o + 1], w[o + 3], w[o + 4], w[o + 5])
    ctx.translate(att.x, att.y)
    ctx.rotate(att.rotation * DEG)
    if (image) {
      ctx.scale(att.scaleX, -att.scaleY)
      ctx.drawImage(image, -att.width / 2, -att.height / 2, att.width, att.height)
    } else {
      ctx.scale((att.scaleX * att.width) / region!.originalWidth, (att.scaleY * att.height) / region!.originalHeight)
      drawRegion(ctx, atlas.pages[region!.page], region!)
    }
    ctx.restore()
  }
}

/**
 * A copy of a region at its original (untrimmed) size: the trimmed pixels where they sat, the
 * rest transparent.
 */
export function extractRegion(atlas: RigAtlas, region: AtlasRegion, canvas: HTMLCanvasElement): HTMLCanvasElement {
  canvas.width = region.originalWidth
  canvas.height = region.originalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Copying an attachment image needs a canvas with a 2D context')
  ctx.imageSmoothingEnabled = false
  const r = region
  // Offsets are from the bottom left; canvas rows run top-down.
  ctx.drawImage(atlas.pages[r.page] as CanvasImageSource, r.x, r.y, r.width, r.height, r.offsetX, r.originalHeight - r.offsetY - r.height, r.width, r.height)
  return canvas
}

/** Draws a region centered on the origin at its original size, upright in a y-up space. */
function drawRegion(ctx: CanvasRenderingContext2D, image: RigAtlas['pages'][number], r: AtlasRegion): void {
  // Images run top-down, the rig bottom-up.
  ctx.scale(1, -1)
  // Move to the trimmed pixels' top-left within the original frame.
  ctx.translate(-r.originalWidth / 2 + r.offsetX, -r.originalHeight / 2 + (r.originalHeight - r.offsetY - r.height))
  ctx.drawImage(image as CanvasImageSource, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height)
}
