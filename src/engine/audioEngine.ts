/**
 * Procedural Cathedral Audio Synthesizer (100% Web Audio API, zero external files).
 *
 * - Procedural 4.6-second stereo convolution reverb impulse response simulating
 *   a vast stone cathedral nave.
 * - Slowly breathing warm architectural drone (low-passed detuned harmonics) whose
 *   timbre and warmth track solar altitude.
 * - Delicate resonant glass/water harmonic tones on obsidian pool ripples (Movement II).
 * - Spine-tingling harmonic chord swell as the suspended prisms lock into alignment (Movement III).
 */

export class CathedralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOscillators: OscillatorNode[] = [];
  private lfoOsc: OscillatorNode | null = null;
  private prismVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private isMuted = false;
  private isInitialized = false;
  private lastRippleToneTime = 0;

  // Lydian / pentatonic resonant glass frequencies in D major-9th cathedral tuning
  private readonly waterScaleHz = [
    293.66, // D4
    329.63, // E4
    369.99, // F#4
    440.0, // A4
    493.88, // B4
    587.33, // D5
    659.25, // E5
    739.99, // F#5
    880.0, // A5
  ];

  public unlock(): void {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.connect(ctx.destination);
      this.masterGain = masterGain;

      // Procedural cathedral convolution reverb with long stone decay tail
      const convolver = ctx.createConvolver();
      convolver.buffer = this.buildCathedralImpulse(ctx, 5.8, 2.35);
      this.convolver = convolver;

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.68;
      convolver.connect(wetGain);
      wetGain.connect(masterGain);

      // Slowly breathing warm architectural drone (D2 + A2 + D3 + F#3 subtle detune)
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.setValueAtTime(240, ctx.currentTime);
      droneFilter.Q.setValueAtTime(1.1, ctx.currentTime);
      this.droneFilter = droneFilter;

      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.16, ctx.currentTime);
      this.droneGain = droneGain;

      droneFilter.connect(droneGain);
      droneGain.connect(convolver);
      droneGain.connect(masterGain);

      const droneSpec: Array<{ freq: number; detune: number; type: OscillatorType; gain: number }> = [
        { freq: 73.42, detune: -3.5, type: 'sine', gain: 0.48 }, // D2
        { freq: 73.42, detune: 3.5, type: 'triangle', gain: 0.16 }, // D2 warmth
        { freq: 110.0, detune: -2.2, type: 'sine', gain: 0.24 }, // A2 fifth
        { freq: 146.83, detune: 4.1, type: 'sine', gain: 0.14 }, // D3 octave
        { freq: 185.0, detune: -3.0, type: 'sine', gain: 0.06 }, // F#3 harmonic tint
      ];

      for (const spec of droneSpec) {
        const osc = ctx.createOscillator();
        osc.type = spec.type;
        osc.frequency.setValueAtTime(spec.freq, ctx.currentTime);
        osc.detune.setValueAtTime(spec.detune, ctx.currentTime);

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = spec.gain;
        osc.connect(voiceGain);
        voiceGain.connect(droneFilter);
        osc.start();
        this.droneOscillators.push(osc);
      }

      // Ultra-slow architectural breathing LFO modulating drone amplitude gently (~11s cycle)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.09;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.032;
      lfo.connect(lfoDepth);
      lfoDepth.connect(droneGain.gain);
      lfo.start();
      this.lfoOsc = lfo;

      // Three continuous glass-harmonic voices for the three suspended prisms (A4, E5, F#5)
      const prismFreqs = [440.0, 659.25, 739.99];
      for (const freq of prismFreqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        osc.connect(g);
        g.connect(convolver);
        osc.start();
        this.prismVoices.push({ osc, gain: g });
      }

      this.isInitialized = true;
      this.applyMasterVolume();
    } catch {
      // Ignore if audio context cannot initialize in restricted environments
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.applyMasterVolume();
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private applyMasterVolume(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.isMuted ? 0.0001 : 0.72;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.14);
  }

  /**
   * Shift the drone's low-pass warmth and harmonic shimmer gently with solar altitude
   * and prism alignment states.
   */
  public updateAtmosphere(
    altitudeDeg: number,
    eclipseFactor: number,
    prismAlignments: readonly number[],
    climaxProgress = 0,
  ): void {
    if (!this.ctx || !this.droneFilter || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Higher sun opens the harmonic filter warmer; 3/3 climax opens a subtle radiant warmth
    const normAlt = Math.max(0, Math.min(1, (altitudeDeg - 20) / 56));
    const cutoff = 165 + normAlt * 240 - eclipseFactor * 75 + climaxProgress * 120;
    this.droneFilter.frequency.setTargetAtTime(Math.max(115, cutoff), now, 0.28);

    // Subtle singing crystal overtone proportional to each prism's solar alignment & climax bloom
    for (let i = 0; i < this.prismVoices.length; i++) {
      const align = prismAlignments[i] ?? 0;
      const baseGain = align > 0.45 ? Math.pow((align - 0.45) / 0.55, 2) * 0.036 : 0.0001;
      const targetGain = baseGain + climaxProgress * 0.018;
      this.prismVoices[i].gain.gain.setTargetAtTime(targetGain, now, 0.24);
    }
  }

  /**
   * Synthesize a delicate resonant water/glass harmonic tone when a ripple is dropped.
   */
  public triggerWaterRipple(worldX: number, worldZ: number, strength = 1.0): void {
    if (!this.ctx || !this.convolver || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Rate-limit rapid drag ripples to maintain serene cathedral cadence
    if (now - this.lastRippleToneTime < 0.11) return;
    this.lastRippleToneTime = now;

    // Map spatial position smoothly onto the cathedral Lydian scale
    const spatialHash = Math.abs(Math.sin(worldX * 0.73 + worldZ * 0.41));
    const noteIdx = Math.floor(spatialHash * this.waterScaleHz.length) % this.waterScaleHz.length;
    const freq = this.waterScaleHz[noteIdx];

    const osc = this.ctx.createOscillator();
    const overtone = this.ctx.createOscillator();
    osc.type = 'sine';
    overtone.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    overtone.frequency.setValueAtTime(freq * 2.004, now); // crystalline shimmer harmonic

    const env = this.ctx.createGain();
    const peak = Math.min(0.11, 0.055 * strength);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.85);

    const overGain = this.ctx.createGain();
    overGain.gain.value = 0.18;

    osc.connect(env);
    overtone.connect(overGain);
    overGain.connect(env);
    env.connect(this.convolver);
    env.connect(this.masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 1.95);
    overtone.stop(now + 1.95);
  }

  /**
   * Delicate single-prism crystal lock resonance chime.
   */
  public triggerPrismLock(prismIndex: number): void {
    if (!this.ctx || !this.convolver || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5
    const freq = notes[prismIndex % notes.length];

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.09, now + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(env);
    env.connect(this.convolver);
    osc.start(now);
    osc.stop(now + 2.9);
  }

  /**
   * Ceremonial 5-second cathedral harmonic chord swell when all three prisms lock,
   * crowned with warm, shimmering fifth and octave overtones and a long reverb tail.
   */
  public triggerHarmonicResonanceSwell(): void {
    if (!this.ctx || !this.convolver || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Warm low-pass silk filter so high fifth/octave overtones shimmer without metallic harshness
    const shimmerFilter = this.ctx.createBiquadFilter();
    shimmerFilter.type = 'lowpass';
    shimmerFilter.frequency.setValueAtTime(1450, now);
    shimmerFilter.frequency.linearRampToValueAtTime(3400, now + 3.2);
    shimmerFilter.frequency.exponentialRampToValueAtTime(1200, now + 9.6);
    shimmerFilter.Q.setValueAtTime(0.7, now);
    shimmerFilter.connect(this.convolver);

    // Foundation open D cathedral chord + shimmering fifth/octave cathedral overtone halo
    const voices: Array<{
      freq: number;
      type: OscillatorType;
      detune: number;
      delay: number;
      attack: number;
      hold: number;
      decay: number;
      amp: number;
    }> = [
      // Deep stone foundation (D2, A2 fifth, D3 octave, A3 fifth)
      { freq: 73.42, type: 'sine', detune: -2.0, delay: 0.0, attack: 1.4, hold: 3.4, decay: 8.8, amp: 0.052 },
      { freq: 110.0, type: 'triangle', detune: 1.8, delay: 0.08, attack: 1.6, hold: 3.4, decay: 8.6, amp: 0.036 },
      { freq: 146.83, type: 'triangle', detune: -2.5, delay: 0.14, attack: 1.5, hold: 3.5, decay: 8.8, amp: 0.044 },
      { freq: 220.0, type: 'sine', detune: 2.2, delay: 0.22, attack: 1.7, hold: 3.6, decay: 8.8, amp: 0.042 },
      // Warm resonant heart (D4 octave, F#4 third, A4 fifth)
      { freq: 293.66, type: 'sine', detune: -1.8, delay: 0.3, attack: 1.9, hold: 3.8, decay: 9.0, amp: 0.04 },
      { freq: 369.99, type: 'sine', detune: 2.4, delay: 0.42, attack: 2.1, hold: 3.9, decay: 9.0, amp: 0.032 },
      { freq: 440.0, type: 'sine', detune: -2.8, delay: 0.54, attack: 2.2, hold: 4.1, decay: 9.2, amp: 0.036 },
      // Shimmering fifth & octave cathedral overtones (D5, A5 fifth, D6 octave pairs)
      { freq: 587.33, type: 'sine', detune: -3.2, delay: 0.72, attack: 2.4, hold: 4.3, decay: 9.4, amp: 0.028 },
      { freq: 587.33, type: 'sine', detune: 3.6, delay: 0.78, attack: 2.5, hold: 4.3, decay: 9.4, amp: 0.022 },
      { freq: 880.0, type: 'sine', detune: -3.8, delay: 1.05, attack: 2.7, hold: 4.5, decay: 9.6, amp: 0.021 },
      { freq: 880.0, type: 'sine', detune: 4.0, delay: 1.12, attack: 2.8, hold: 4.5, decay: 9.6, amp: 0.018 },
      { freq: 1174.66, type: 'sine', detune: -3.0, delay: 1.38, attack: 2.9, hold: 4.7, decay: 9.8, amp: 0.015 },
      { freq: 1174.66, type: 'sine', detune: 3.4, delay: 1.46, attack: 3.0, hold: 4.7, decay: 9.8, amp: 0.013 },
    ];

    for (const v of voices) {
      const osc = this.ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      osc.detune.setValueAtTime(v.detune, now);

      const env = this.ctx.createGain();
      const t0 = now + v.delay;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(v.amp, t0 + v.attack);
      env.gain.linearRampToValueAtTime(v.amp * 0.82, t0 + v.hold);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + v.decay);

      osc.connect(env);
      env.connect(shimmerFilter);
      osc.start(t0);
      osc.stop(t0 + v.decay + 0.15);
    }
  }

  /**
   * Generates a procedural stereo cathedral impulse response buffer with
   * sculpted early stone reflections and warm exponential high-cut tail.
   */
  private buildCathedralImpulse(
    ctx: AudioContext,
    durationSec: number,
    decay: number,
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lowpass = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const white = Math.random() * 2 - 1;
        // One-pole progressive darkening simulating travertine stone absorption
        const alpha = 0.24 - t * 0.16;
        lowpass += (white - lowpass) * Math.max(0.04, alpha);
        data[i] = lowpass * env;
      }

      // Inject subtle discrete early nave reflections (40ms, 82ms, 135ms)
      const taps = [0.042, 0.086, 0.138, 0.195];
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor(taps[k] * sampleRate) + ch * 29;
        if (idx < length) {
          data[idx] += (0.28 / (k + 1)) * (ch === 0 ? 1 : -0.92);
        }
      }
    }

    return buffer;
  }

  public dispose(): void {
    try {
      this.droneOscillators.forEach((o) => o.stop());
      this.prismVoices.forEach((v) => v.osc.stop());
      this.lfoOsc?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore audio teardown errors
    }
    this.droneOscillators = [];
    this.prismVoices = [];
    this.ctx = null;
    this.isInitialized = false;
  }
}
