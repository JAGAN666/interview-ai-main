const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LiveMonitor, changed } = require('./live-monitor');
const frame = (value, source = 'screen1') => ({ pixels: Buffer.alloc(400, value), jpeg: Buffer.from([value]), source });
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(analyze = async jpeg => ({ items: [], summary: String(jpeg[0]) })) {
  let time = 0;
  let current = frame(0);
  const events = [];
  const monitor = new LiveMonitor({ capture: async () => current, analyze, emit: (type, data) => events.push({ type, data }), now: () => time });
  monitor.enabled = true;
  return { monitor, events, set: value => { current = value; }, advance: ms => { time += ms; } };
}

test('detects small local edits and display switches, ignores tiny noise', () => {
  const a = frame(0), b = frame(0);
  b.pixels.fill(255, 0, 48);
  assert.equal(changed(a, b), true);
  assert.equal(changed(a, frame(2)), false);
  assert.equal(changed(a, frame(0, 'screen2')), true);
});

test('answers initial screen, skips duplicates, answers a changed question', async () => {
  const s = setup();
  await s.monitor.tick();
  assert.equal(s.events.filter(e => e.type === 'result').length, 0);
  s.advance(1000); await s.monitor.tick(); await flush();
  s.advance(1000); await s.monitor.tick(); await flush();
  assert.equal(s.events.filter(e => e.type === 'result').length, 1);
  s.set(frame(255)); await s.monitor.tick();
  s.advance(1000); await s.monitor.tick(); await flush();
  assert.deepEqual(s.events.filter(e => e.type === 'result').map(e => e.data.summary), ['0', '255']);
});

test('captures while inference is busy, drops obsolete results and keeps latest screen only', async () => {
  const requests = [];
  const s = setup(jpeg => new Promise(resolve => requests.push({ value: jpeg[0], resolve })));
  await s.monitor.tick(true);
  s.set(frame(100)); await s.monitor.tick();
  s.set(frame(200)); await s.monitor.tick();
  requests[0].resolve({ items: [], summary: 'obsolete' }); await flush();
  assert.equal(s.events.filter(e => e.type === 'result').length, 0);
  s.advance(1000); await s.monitor.tick();
  assert.deepEqual(requests.map(r => r.value), [0, 200]);
  requests[1].resolve({ items: [], summary: 'latest' }); await flush();
  assert.equal(s.events.filter(e => e.type === 'result')[0].data.summary, 'latest');
});

test('pause suppresses in-flight result; manual checks still work', async () => {
  let resolve;
  const s = setup(() => new Promise(r => { resolve = r; }));
  await s.monitor.tick(true);
  s.monitor.stop();
  resolve({ items: [], summary: 'old' }); await flush();
  await s.monitor.tick();
  assert.equal(s.events.filter(e => e.type === 'result').length, 0);
  await s.monitor.tick(true);
  resolve({ items: [], summary: 'manual' }); await flush();
  assert.equal(s.events.filter(e => e.type === 'result')[0].data.summary, 'manual');
});

test('failed analysis retries unchanged screen after backoff', async () => {
  let calls = 0;
  const s = setup(async () => { if (++calls === 1) throw new Error('offline'); return { items: [], summary: 'recovered' }; });
  await s.monitor.tick(true); await flush();
  s.advance(1000); await s.monitor.tick();
  assert.equal(calls, 1);
  s.advance(10000); await s.monitor.tick(); await flush();
  assert.equal(calls, 2);
  assert.equal(s.events.filter(e => e.type === 'result')[0].data.summary, 'recovered');
});

test('continuous animation cannot postpone analysis forever', async () => {
  const s = setup();
  for (let i = 0; i < 4; i++) {
    s.set(frame(i * 60)); await s.monitor.tick(); s.advance(1000);
  }
  await flush();
  assert.equal(s.events.filter(e => e.type === 'result').length, 1);
});

test('context changes reanalyze an otherwise identical screen', async () => {
  const notes = [];
  const s = setup(async (_, note) => { notes.push(note); return { items: [] }; });
  await s.monitor.tick(true); await flush();
  s.monitor.setNote('Use Python');
  s.advance(1000); await s.monitor.tick(); await flush();
  assert.deepEqual(notes, ['', 'Use Python']);
});

test('capture failure recovers and resume resets the baseline', async () => {
  const s = setup();
  const capture = s.monitor.capture;
  s.monitor.capture = async () => { throw new Error('permission denied'); };
  await s.monitor.tick();
  assert.equal(s.events.at(-1).type, 'error');
  s.monitor.capture = capture;
  s.monitor.stop(); s.monitor.start(); await flush();
  s.advance(1000); await s.monitor.tick(); await flush();
  s.monitor.stop();
  assert.equal(s.events.filter(e => e.type === 'result').length, 1);
});

test('keeps coding context across empty screens and replaces it on the next question', async () => {
  const contexts = [];
  const results = [
    [{ question_type: 'coding', question: 'Find a pair' }],
    [],
    [{ question_type: 'coding', question: 'Sort a list' }],
    [],
  ];
  const s = setup(async (_, __, question) => {
    contexts.push(question);
    return { items: results.shift() };
  });
  for (let i = 0; i < 3; i++) {
    await s.monitor.tick(true);
    await flush();
  }
  assert.equal(s.events.filter(event => event.type === 'result').length, 2);
  assert.equal(s.monitor.coding.question, 'Sort a list');
  s.monitor.clearQuestion();
  await s.monitor.tick(true);
  await flush();
  assert.deepEqual(contexts, [undefined, 'Find a pair', 'Find a pair', undefined]);
});

test('manual checks during capture coalesce into one follow-up', async () => {
  const s = setup();
  let release;
  s.monitor.capture = () => new Promise(resolve => { release = resolve; });
  const first = s.monitor.tick();
  await s.monitor.tick(true);
  await s.monitor.tick(true);
  let calls = 0;
  s.monitor.capture = async () => { calls++; return frame(100); };
  release(frame(0));
  await first;
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(s.events.filter(e => e.type === 'result').map(e => e.data.summary), ['100']);
});

test('finish during capture suppresses stale errors and queued checks', async () => {
  const s = setup();
  let rejectCapture;
  s.monitor.capture = () => new Promise((_, reject) => { rejectCapture = reject; });
  const first = s.monitor.tick();
  await s.monitor.tick(true);
  s.monitor.stop();
  s.monitor.clearQuestion();
  rejectCapture(new Error('stale error'));
  await first;
  assert.deepEqual(s.events.map(e => e.type), ['live', 'clear']);
});

test('ending or clearing a review cancels its network request', async () => {
  for (const action of ['stop', 'clearQuestion']) {
    let activeSignal;
    const s = setup((_, __, ___, signal) => new Promise((resolve, reject) => {
      activeSignal = signal;
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    await s.monitor.tick(true);
    s.monitor[action]();
    await flush();
    assert.ok(activeSignal.aborted);
    assert.equal(s.monitor.busy, false);
    assert.ok(!s.events.some(event => event.type === 'error'));
  }
});

test('a successful manual retry immediately restores live checks', async () => {
  let calls = 0;
  const s = setup(async () => {
    if (++calls === 1) throw new Error('offline');
    return { items: [] };
  });
  await s.monitor.tick(true); await flush();
  await s.monitor.tick(true); await flush();
  s.set(frame(255));
  await s.monitor.tick();
  s.advance(1000); await s.monitor.tick(); await flush();
  assert.equal(calls, 3);
});

test('scrolling before the first answer keeps the problem context without displaying stale code', async () => {
  const calls = [];
  const s = setup((_, __, context) => new Promise(resolve => calls.push({ context, resolve })));
  await s.monitor.tick(true);
  s.set(frame(255)); await s.monitor.tick();
  const result = (question, relation) => ({ items: [{ question, question_type: 'coding', question_relation: relation }] });
  calls[0].resolve(result('Find two indices', 'new')); await flush();
  assert.ok(!s.events.some(e => e.type === 'result'));
  s.advance(1000); await s.monitor.tick();
  assert.equal(calls[1].context, 'Find two indices');
  const id = s.monitor.coding.id;
  calls[1].resolve(result('Find two indices, duplicates allowed', 'same')); await flush();
  assert.equal(s.monitor.coding.id, id);
  await s.monitor.tick(true);
  assert.match(calls[2].context, /duplicates allowed/);
  calls[2].resolve(result('Find the maximum sum', 'new')); await flush();
  assert.notEqual(s.monitor.coding.id, id);
  assert.equal(s.monitor.coding.context, 'Find the maximum sum');
});
