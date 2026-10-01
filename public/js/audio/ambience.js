// Sparse synthesized birds by day and crickets at night. Shares the Sfx master,
// so M mutes it, while the music toggle leaves it alone.
export class AmbienceAudio {
  constructor(sfx, clock) {
    this.sfx = sfx;
    this.clock = clock;
    this.elapsed = 0;
    this.nextBird = 2;
    this.nextCricket = 1;
    this.birds = 0;
    this.crickets = 0;
  }

  chirp(type, level) {
    const { ctx, master } = this.sfx;
    if (!ctx || ctx.state !== 'running' || this.sfx.muted || document.hidden) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const bird = type === 'bird';
    const f = bird ? 1450 + Math.random() * 550 : 3600 + Math.random() * 600;
    const length = bird ? 0.24 : 0.11;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(bird ? f * 1.42 : f * 0.88, t + length * 0.5);
    o.frequency.exponentialRampToValueAtTime(bird ? f * 0.8 : f * 0.65, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((bird ? 0.012 : 0.004) * level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + length + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    if (bird) this.birds++; else this.crickets++;
  }

  update(dt) {
    this.elapsed += dt;
    const night = this.clock.nightness;
    if (this.elapsed >= this.nextBird) {
      if (night < 0.75) this.chirp('bird', 1 - night);
      this.nextBird = this.elapsed + 3 + Math.random() * 5;
    }
    if (this.elapsed >= this.nextCricket) {
      if (night > 0.2) this.chirp('cricket', night);
      this.nextCricket = this.elapsed + 0.5 + Math.random() * 1.2;
    }
  }
}
