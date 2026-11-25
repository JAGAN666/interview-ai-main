// Exercise the production window, preload and IPC without capturing the desktop.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { app, globalShortcut } = require('electron');
const monitorModule = require('./live-monitor');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const actions = new Map();
const calls = [];
const unavailable = process.argv.includes('--unavailable');
let simulateError = false;
process.env.OVERLAY_LIVE = '0';
process.env.ANTHROPIC_API_KEY = unavailable ? '' : 'offline-fixture';
delete process.env.OVERLAY_AUTOCHECK;

// Drive the same callbacks the OS invokes, without reserving system shortcuts.
globalShortcut.register = (key, handler) => {
  if (unavailable && /[HK]$/.test(key)) return false;
  actions.set(key.split('+').pop(), handler);
  return true;
};
monitorModule.LiveMonitor = class extends monitorModule.LiveMonitor {
  constructor(options) {
    super({
      ...options,
      capture: async () => ({ source: 'fixture', pixels: Buffer.alloc(48), jpeg: Buffer.alloc(1) }),
      analyze: async (_, note, context) => {
        calls.push(note);
        if (simulateError) throw new Error('Simulated network failure');
        return { summary: 'One coding question', items: [{
          question_relation: context ? 'same' : 'new', observations: ['add(2, 3) expects 5'],
          question: 'Add two numbers', question_type: 'coding', candidate_answer: 'a - b',
          correct_answer: context ? '' : 'return a + b', verdict: 'incorrect', confidence: 'high', explanation: 'Use addition.'
        }] };
      },
    });
  }
};

let cancelled = false;
require('./analyzer').answerFollowUp = async (review, history, prompt, signal, onText) => {
  if (prompt === 'Edge cases') {
    onText('First boundary');
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    cancelled = true;
    return 'Obsolete reply';
  }
  assert.equal(review.question, 'Add two numbers');
  assert.equal(review.context.initialSolution, 'return a + b');
  assert.deepEqual(review.context.observations, ['add(2, 3) expects 5']);
  return 'Turn ' + (history.length / 2 + 1) + ': ' + prompt;
};

async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await pause(50);
  }
  throw new Error('Timed out waiting for ' + check.toString());
}

let completed = false;
app.on('will-quit', () => { if (!completed) process.exitCode = 1; });
app.once('browser-window-created', async (_, win) => {
  try {
    const page = js => win.webContents.executeJavaScript(js);
    const click = async id => {
      const point = await page(`(() => {
        const e = document.getElementById(${JSON.stringify(id)}) || document.querySelector(${JSON.stringify(id)});
        e.scrollIntoView({ block: 'nearest' });
        const r = e.getBoundingClientRect();
        if (e.disabled || !r.width || !r.height) throw new Error('Unavailable control: ' + e.id);
        return { x: Math.floor(r.x + r.width / 2), y: Math.floor(r.y + r.height / 2) };
      })()`);
      for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 });
    };
    await once(win.webContents, 'did-finish-load');
    win.show();
    win.focus();
    if (unavailable) {
      await until(() => page("['analyze','live','hide','click-through'].every(id => document.getElementById(id).disabled)"));
      await click('clear');
      await until(() => page("document.querySelector('#status').textContent.includes('ANTHROPIC_API_KEY')"));
      actions.get('Enter')();
      actions.get('L')();
      assert.equal(calls.length, 0);
      assert.ok(await page("document.querySelector('#shortcut-warning').textContent.includes('H')"));
      app.once('before-quit', () => { completed = true; console.log('Passed unavailable controls'); });
      await click('quit');
      await until(() => completed);
      return;
    }
    await click('note');
    await until(() => page("document.activeElement.id === 'note'"));
    await win.webContents.insertText('Use Python');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await until(() => page("document.querySelector('code')?.textContent === 'return a + b'"));
    assert.deepEqual(calls, ['Use Python']);
    await click('.discuss');
    await until(() => page("document.querySelector('.panel').classList.contains('discussing')"));
    await click('#suggested button');
    await until(() => page("document.querySelector('#messages').textContent.includes('Turn 1: Give me a hint')"));
    await click('back');
    await until(() => page("!document.querySelector('.panel').classList.contains('discussing')"));
    await click('analyze');
    await until(() => page("document.querySelector('details code')?.textContent === 'return a + b'"));
    assert.equal(await page("document.querySelector('details').open"), false);
    await click('.discuss');
    await until(() => page("document.activeElement.id === 'prompt'"));
    await win.webContents.insertText('Why does it fail?');
    await click('ask');
    await until(() => page("document.querySelector('#messages').textContent.includes('Turn 2: Why does it fail?')"));
    await click('back');
    await until(() => page("!document.querySelector('.panel').classList.contains('discussing')"));
    await click('live');
    await until(() => page("live === true"));
    await click('live');
    await until(() => page("live === false"));
    simulateError = true;
    await click('analyze');
    await until(() => page("!document.querySelector('#error').classList.contains('hidden')"));
    await click('clear');
    await until(() => page("document.querySelector('#error').classList.contains('hidden') && !document.querySelector('code')"));
    simulateError = false;
    actions.get('Enter')();
    await until(() => page("!!document.querySelector('code')"));
    const ready = once(win.webContents, 'did-finish-load');
    win.webContents.reload();
    await ready;
    await until(() => page("document.querySelector('#note').value === 'Use Python' && !!document.querySelector('code')"));
    await click('.discuss');
    await until(() => page("document.activeElement.id === 'prompt'"));
    await click('#suggested button:nth-child(2)');
    await until(() => page("document.querySelector('.waiting')?.textContent === 'First boundary'"));
    await click('finish');
    await until(() => cancelled);
    assert.equal(await page("document.querySelector('#messages').textContent"), '');
    await until(() => page("!document.querySelector('code') && live === false"));
    await click('click-through');
    await until(() => page("document.querySelector('#click-through').getAttribute('aria-pressed') === 'true'"));
    actions.get('K')();
    await until(() => page("document.querySelector('#click-through').getAttribute('aria-pressed') === 'false'"));
    await click('hide');
    await until(() => !win.isVisible());
    actions.get('H')();
    assert.ok(win.isVisible());
    const [x] = win.getPosition();
    actions.get('Left')();
    assert.ok(win.getPosition()[0] <= x);
    for (const key of ['Right', 'Down', 'Up', 'L', 'L', 'R']) actions.get(key)();
    app.once('before-quit', () => { completed = true; console.log('Passed overlay controls'); });
    win.focus();
    await click('quit');
    await until(() => completed);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
require('./main');
