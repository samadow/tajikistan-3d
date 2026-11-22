/**
 * Procedural ambient soundscape (Web Audio): wind over the mountains plus a
 * soft drone tuned to the scene. Synthesised at runtime — no audio files, so
 * no licensing questions (TECHNICAL_AUDIT R3). Off by default; browsers only
 * allow audio after a user gesture, and the toggle is that gesture.
 */
export class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private droneGain: GainNode | null = null
  private lfoTimer: ReturnType<typeof setInterval> | null = null

  start() {
    if (this.ctx) {
      void this.ctx.resume()
      this.fadeTo(0.55)
      return
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master

    // Wind: looping pink-ish noise through a slowly sweeping band-pass filter.
    const length = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 420
    filter.Q.value = 0.7
    const windGain = ctx.createGain()
    windGain.gain.value = 0.5
    noise.connect(filter).connect(windGain).connect(master)
    noise.start()
    this.windFilter = filter

    // Drone: two detuned low sines (a fifth apart) for warmth.
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.05
    droneGain.connect(master)
    for (const [freq, detune] of [
      [73.4, -4],
      [110, 5],
    ]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.detune.value = detune
      osc.connect(droneGain)
      osc.start()
    }
    this.droneGain = droneGain

    // Gusts: wander the filter frequency.
    this.lfoTimer = setInterval(() => {
      if (!this.ctx || !this.windFilter) return
      const t = this.ctx.currentTime
      this.windFilter.frequency.linearRampToValueAtTime(260 + Math.random() * 520, t + 3)
    }, 3000)
    this.fadeTo(0.55)
  }

  /** Brighter, airier mix at altitude (detail stage / story close-ups). */
  setMood(mood: 'map' | 'detail' | 'space') {
    if (!this.ctx || !this.droneGain) return
    const t = this.ctx.currentTime
    const level = mood === 'space' ? 0.09 : mood === 'detail' ? 0.035 : 0.05
    this.droneGain.gain.linearRampToValueAtTime(level, t + 1.5)
  }

  stop() {
    this.fadeTo(0)
    setTimeout(() => {
      if (this.master && this.master.gain.value < 0.01) void this.ctx?.suspend()
    }, 900)
  }

  dispose() {
    if (this.lfoTimer) clearInterval(this.lfoTimer)
    void this.ctx?.close()
    this.ctx = null
  }

  private fadeTo(value: number) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(this.master.gain.value, t)
    this.master.gain.linearRampToValueAtTime(value, t + 0.8)
  }
}
