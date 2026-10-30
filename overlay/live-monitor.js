// Capture independently of inference, retaining only the newest screen.
function changed(a, b) {
  if (!a || !b || a.source !== b.source || a.pixels.length !== b.pixels.length) return true;
  let count = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (Math.max(Math.abs(a.pixels[i] - b.pixels[i]), Math.abs(a.pixels[i + 1] - b.pixels[i + 1]), Math.abs(a.pixels[i + 2] - b.pixels[i + 2])) > 25) {
      if (++count >= 12) return true;
    }
  }
  return false;
}

class LiveMonitor {
  constructor({ capture, analyze, emit, now = Date.now, settleMs = 700, maxWaitMs = 3000, retryMs = 10000 }) {
    Object.assign(this, { capture, analyze, emit, now, settleMs, maxWaitMs, retryMs });
    this.enabled = false;
    this.version = 0;
    this.note = '';
    this.retryAt = 0;
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.latest = null;
    this.pending = false;
    this.retryAt = 0;
    this.version++;
    this.emit('live', { enabled: true });
    this.timer = setInterval(() => void this.tick(), 1000);
    void this.tick();
  }

  stop() {
    this.enabled = false;
    clearInterval(this.timer);
    this.version++;
    this.pending = false;
    this.emit('live', { enabled: false });
  }

  setNote(note) {
    if (note === this.note) return;
    this.note = note;
    this.version++;
    if (this.latest) {
      this.pending = true;
      this.since = this.lastChange = this.now();
    }
  }

  async tick(force = false) {
    if (this.capturing || (!this.enabled && !force) || (!force && this.now() < this.retryAt)) return;
    this.capturing = true;
    const version = this.version;
    try {
      const frame = await this.capture();
      if (version !== this.version) return;
      const time = this.now();
      if (force || changed(this.latest, frame)) {
        if (!this.pending) this.since = time;
        this.lastChange = time;
        this.latest = frame;
        this.version++;
        this.pending = true;
        this.emit('status', { state: 'changed' });
      }
      if (this.pending && (force || time - this.lastChange >= this.settleMs || time - this.since >= this.maxWaitMs)) {
        void this.drain();
      }
    } catch (error) {
      this.retryAt = this.now() + this.retryMs;
      this.emit('error', { message: error.message || String(error) });
    } finally {
      this.capturing = false;
    }
  }

  async drain() {
    if (this.busy || !this.pending) return;
    this.busy = true;
    this.pending = false;
    const version = this.version;
    const frame = this.latest;
    this.emit('status', { state: 'analyzing' });
    try {
      const result = await this.analyze(frame.jpeg, this.note);
      if (version === this.version) this.emit('result', { ...result, at: this.now() });
    } catch (error) {
      if (version === this.version) {
        this.pending = this.enabled;
        this.since = this.lastChange = this.now();
        this.retryAt = this.now() + this.retryMs;
        this.emit('error', { message: error.message || String(error) });
      }
    } finally {
      this.busy = false;
      // A manual request made during inference must not be lost while paused.
      if (this.pending && !this.enabled) void this.drain();
    }
  }
}

module.exports = { LiveMonitor, changed };
