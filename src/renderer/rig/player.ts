import { blendPoses, emptyPose, frameAt, poseAt, type BakedAnimation, type BakedRig, type Pose, type RigEvent } from './baked'

interface Entry {
  animation: BakedAnimation
  loop: boolean
  /** Seconds since the entry started. */
  time: number
  /** What this entry is fading in from (itself possibly still fading), until the fade ends. */
  from: Entry | null
  fade: number
  fadeDuration: number
}

interface Queued {
  animation: BakedAnimation
  loop: boolean
  /** Start once the current entry has played this many seconds. */
  startAt: number
}

/**
 * Plays baked animations one at a time, crossfading `mix` seconds between them.
 */
export class RigPlayer {
  /** Seconds to crossfade between animations. */
  mix: number
  /** Called for each keyed event an animation passes, e.g. `hit` in attacks. */
  onEvent?: (event: RigEvent, animation: string) => void

  private current: Entry | null = null
  private queue: Queued[] = []
  /** Scratch poses, one per depth of the fade chain. */
  private readonly poses: Pose[] = []

  constructor(
    private readonly rig: BakedRig,
    mix = 0.2
  ) {
    this.mix = mix
  }

  /** Name of the animation playing (or fading in), if any. */
  get animation(): string | undefined {
    return this.current?.animation.name
  }

  /** Switches to `animation` now, crossfading from whatever was playing. Clears the queue. */
  set(animation: BakedAnimation, loop = true): void {
    this.queue = []
    this.start(animation, loop)
  }

  /**
   * Plays `animation` after the current one. When the current one doesn't loop, the crossfade
   * starts early so it ends as the current animation does; a looping one finishes its pass.
   */
  add(animation: BakedAnimation, loop = true): void {
    const last = this.queue[this.queue.length - 1]
    const before = last ? last.animation : this.current?.animation
    if (!before) return this.start(animation, loop)
    let startAt = Math.max(0, before.duration - this.mix)
    if (!last && this.current!.loop) {
      const d = this.current!.animation.duration
      startAt = d > 0 ? Math.ceil(this.current!.time / d) * d : 0
    }
    this.queue.push({ animation, loop, startAt })
  }

  update(delta: number): void {
    const current = this.current
    if (!current) return
    const was = current.time
    for (let e: Entry | null = current; e; e = e.from) {
      if (e !== current) e.time += delta
      if (!e.from) continue
      e.fade += delta
      // Once an entry has fully faded in, everything it faded from is gone.
      if (e.fade >= e.fadeDuration) e.from = null
    }
    current.time += delta
    this.fireEvents(current, was)
    const next = this.queue[0]
    // A queued animation starts on the frame after the current one passes its start time,
    // carrying over the time by which it passed.
    if (next && was >= next.startAt) {
      this.queue.shift()
      this.start(next.animation, next.loop)
      const overshoot = was - next.startAt
      this.current!.time = overshoot + delta
      this.current!.fade = overshoot
    }
  }

  /** The blended pose for this moment, or null before anything plays. */
  apply(): Pose | null {
    return this.current ? this.poseOf(this.current, 0) : null
  }

  /** An entry's pose: what it fades in from (recursively), blended toward its own animation. */
  private poseOf(entry: Entry, depth: number): Pose {
    const own = this.scratch(depth)
    poseAt(this.rig, entry.animation, frameAt(this.rig, entry.animation, this.localTime(entry), entry.loop), own)
    if (!entry.from || entry.fadeDuration <= 0) return own
    const from = this.poseOf(entry.from, depth + 1)
    blendPoses(from, own, Math.min(1, entry.fade / entry.fadeDuration))
    own.world.set(from.world)
    return own
  }

  private scratch(depth: number): Pose {
    while (this.poses.length <= depth) this.poses.push(emptyPose(this.rig))
    return this.poses[depth]
  }

  private start(animation: BakedAnimation, loop: boolean): void {
    const from = this.current
    this.current = { animation, loop, time: 0, from, fade: 0, fadeDuration: from ? this.mix : 0 }
  }

  private localTime(entry: Entry): number {
    const d = entry.animation.duration
    if (entry.loop && d > 0) return entry.time % d
    return Math.min(entry.time, d)
  }

  private fireEvents(entry: Entry, from: number): void {
    const { events, duration, name } = entry.animation
    if (!this.onEvent || !events.length) return
    const to = entry.time
    if (entry.loop && duration > 0) {
      for (let pass = Math.floor(from / duration); pass * duration < to; pass++) {
        for (const e of events) {
          const at = pass * duration + e.time
          if (at >= from && at < to) this.onEvent(e, name)
        }
      }
    } else {
      for (const e of events) if (e.time >= from && e.time < to) this.onEvent(e, name)
    }
  }
}
