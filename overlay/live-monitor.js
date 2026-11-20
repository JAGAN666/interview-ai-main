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
    this.session = 0;
    this.questionId = 0;
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
    this.session++;
    this.analysisRequest?.abort();
    this.enabled = false;
    clearInterval(this.timer);
    this.version++;
    this.pending = false;
    this.forceQueued = false;
    this.emit('live', { enabled: false });
  }

  clearQuestion() {
    this.session++;
    this.analysisRequest?.abort();
    this.version++;
    this.pending = false;
    this.forceQueued = false;
    this.coding = null;
    this.emit('clear');
  }

  setNote(note) {
    if (note === this.note) return;
    this.session++;
    this.note = note;
    this.version++;
    if (this.latest && this.enabled) {
      this.pending = true;
      this.since = this.lastChange = this.now();
    }
  }

  async tick(force = false) {
    if (this.capturing) {
      if (force) this.forceQueued = true;
      return;
    }
    if ((!this.enabled && !force) || (!force && this.now() < this.retryAt)) return;
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
      if (version !== this.version) return;
      this.retryAt = this.now() + this.retryMs;
      this.emit('error', { message: error.message || String(error) });
    } finally {
      this.capturing = false;
      if (this.forceQueued) {
        this.forceQueued = false;
        void this.tick(true);
      }
    }
  }

  async drain() {
    if (this.busy || !this.pending) return;
    this.busy = true;
    this.analysisRequest = new AbortController();
    this.pending = false;
    const version = this.version;
    const frame = this.latest;
    const session = this.session;
    this.emit('status', { state: 'analyzing' });
    try {
      const previous = this.coding?.source === frame.source ? this.coding : null;
      const result = await this.analyze(frame.jpeg, this.note, previous?.context, this.analysisRequest.signal);
      const codingItem = result.items.find(item => item.question_type === 'coding');
      if (session !== this.session || frame.source !== this.latest?.source) return;
      // A scroll can finish before the first response. Keep the recognized task
      // for the queued viewport without displaying an outdated answer.
      if (version !== this.version && !codingItem) return;
      if (codingItem) {
        const same = previous && codingItem.question_relation === 'same';
        const question = same ? previous.question : codingItem.question;
        this.coding = {
          id: same ? previous.id : ++this.questionId,
          source: frame.source,
          snapshot: { ...result, at: this.now() },
          question,
          context: question === codingItem.question ? question : question + '\nKnown details: ' + codingItem.question,
        };
        codingItem.problemId = this.coding.id;
      }
      if (version !== this.version) return;
      this.retryAt = 0;
      if (!result.items.length && previous) {
        if (this.displayedId !== previous.id) {
          this.emit('result', previous.snapshot);
          this.displayedId = previous.id;
        }
        this.emit('status', { state: 'holding' });
        return;
      }
      if (!codingItem) this.coding = null;
      this.displayedId = this.coding?.id;
      this.emit('result', { ...result, at: this.now() });
    } catch (error) {
      if (version === this.version) {
        this.pending = this.enabled;
        this.since = this.lastChange = this.now();
        this.retryAt = this.now() + this.retryMs;
        this.emit('error', { message: error.message || String(error) });
      }
    } finally {
      this.analysisRequest = null;
      this.busy = false;
      // A manual request made during inference must not be lost while paused.
      if (this.pending && !this.enabled) void this.drain();
    }
  }
}

module.exports = { LiveMonitor, changed };
