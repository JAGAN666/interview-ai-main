const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, ipcMain, systemPreferences, nativeImage } = require('electron');
const { analyzeScreenshot, answerFollowUp, errorMessage, MODEL } = require('./analyzer');

const { LiveMonitor } = require('./live-monitor');

const monitor = new LiveMonitor({
  capture: captureDisplayUnderCursor,
  analyze: async (jpeg, context, codingContext, signal) => {
    try { return await analyzeScreenshot(jpeg, context, codingContext, signal); }
    catch (err) { throw new Error(errorMessage(err)); }
  },
  emit: send,
});

const MOVE_STEP = 40;
const MAX_CAPTURE_WIDTH = 2400;

let win;
let clickThrough = false;
let lastResult;
let discussion;

function closeDiscussion() {
  discussion?.request?.abort();
  discussion = null;
  send('discussion', null);
}

function publishDiscussion() {
  if (!discussion?.visible) return;
  const { review, turns, pending, partial, error, failedPrompt } = discussion;
  send('discussion', { question: review.question, turns, pending, partial, error, failedPrompt });
}
const unavailableShortcuts = [];
let lastRendererCrash = -Infinity;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 440;
  const height = 560;

  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 20,
    y: workArea.y + 20,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Excludes the window from screen sharing, recordings and screenshots
  // (NSWindowSharingNone on macOS, WDA_EXCLUDEFROMCAPTURE on Windows).
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.webContents.on('did-finish-load', () => {
    send('config', { model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY), note: monitor.note, platform: process.platform, unavailableShortcuts });
    send('live', { enabled: monitor.enabled });
    if (lastResult) send('result', lastResult);
    publishDiscussion();
    send('click-through', clickThrough);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Overlay renderer stopped:', details.reason);
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    if (Date.now() - lastRendererCrash < 30000) {
      app.quit();
      return;
    }
    lastRendererCrash = Date.now();
    win.webContents.reload();
  });
  win.once('ready-to-show', () => {
    win.showInactive();
    if (process.env.ANTHROPIC_API_KEY && process.env.OVERLAY_LIVE !== '0') monitor.start();
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function send(channel, payload) {
  if (channel === 'clear') { lastResult = null; closeDiscussion(); }
  if (channel === 'result') {
    if (discussion?.review.problemId) {
      const updated = payload.items.find(item => item.problemId === discussion.review.problemId);
      if (updated) discussion.review = updated;
      else closeDiscussion();
    }
    lastResult = payload;
  }
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isCrashed()) {
    win.webContents.send(channel, payload);
  }
}

async function captureDisplayUnderCursor() {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    // Calling getSources triggers the permission prompt the first time.
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    throw new Error('Screen Recording permission needed: System Settings → Privacy & Security → Screen Recording → enable Electron, then restart the overlay.');
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scale = Math.min(display.scaleFactor, MAX_CAPTURE_WIDTH / display.size.width);
  const thumbnailSize = {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = sources.find((s) => s.display_id === String(display.id)) || (sources.length === 1 && sources[0]);
  if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture returned nothing');

  let image = source.thumbnail;
  if (image.getSize().width > MAX_CAPTURE_WIDTH) image = image.resize({ width: MAX_CAPTURE_WIDTH, quality: 'best' });
  // Mask our own UI even on capture backends that ignore content protection.
  // This prevents answers/status updates from triggering another analysis.
  const { width, height } = image.getSize();
  if (win && !win.isDestroyed() && win.isVisible()) {
    const pixels = image.toBitmap();
    const bounds = win.getBounds();
    const sx = width / display.bounds.width;
    const sy = height / display.bounds.height;
    const left = Math.max(0, Math.floor((bounds.x - display.bounds.x) * sx));
    const right = Math.min(width, Math.ceil((bounds.x + bounds.width - display.bounds.x) * sx));
    const top = Math.max(0, Math.floor((bounds.y - display.bounds.y) * sy));
    const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height - display.bounds.y) * sy));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 32;
        pixels[i + 3] = 255;
      }
    }
    image = nativeImage.createFromBitmap(pixels, { width, height });
  }
  const signature = image.resize({ width: Math.min(960, width), quality: 'best' });
  return { get jpeg() { return image.toJPEG(85); }, pixels: signature.toBitmap(), source: `${source.id}:${width}x${height}` };
}

function runAnalysis() {
  if (process.env.ANTHROPIC_API_KEY) void monitor.tick(true);
}

function toggleLive() {
  if (monitor.enabled) monitor.stop();
  else if (process.env.ANTHROPIC_API_KEY) monitor.start();
}

function toggleVisible() {
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function toggleClickThrough() {
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  send('click-through', clickThrough);
}

function move(dx, dy) {
  const [x, y] = win.getPosition();
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  const [width, height] = win.getSize();
  win.setPosition(
    Math.max(area.x, Math.min(x + dx, area.x + area.width - width)),
    Math.max(area.y, Math.min(y + dy, area.y + area.height - height))
  );
}

function registerShortcuts() {
  const shortcuts = {
    'CommandOrControl+Shift+Enter': runAnalysis,
    'CommandOrControl+Shift+L': toggleLive,
    'CommandOrControl+Shift+H': toggleVisible,
    'CommandOrControl+Shift+K': toggleClickThrough,
    'CommandOrControl+Shift+R': () => monitor.clearQuestion(),
    'CommandOrControl+Shift+Up': () => move(0, -MOVE_STEP),
    'CommandOrControl+Shift+Down': () => move(0, MOVE_STEP),
    'CommandOrControl+Shift+Left': () => move(-MOVE_STEP, 0),
    'CommandOrControl+Shift+Right': () => move(MOVE_STEP, 0),
    'CommandOrControl+Shift+Q': () => app.quit(),
  };
  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accelerator, handler)) unavailableShortcuts.push(accelerator.split('+').pop());
  }
}

ipcMain.on('open-discussion', (_event, at, index) => {
  if (!lastResult || lastResult.at !== at || !Number.isInteger(index)) return;
  const review = lastResult.items[index];
  if (review?.question_type !== 'coding') return;
  if (discussion?.review !== review) {
    closeDiscussion();
    discussion = { review, turns: [], pending: '', error: '' };
  }
  discussion.visible = true;
  publishDiscussion();
});
ipcMain.on('close-discussion', () => {
  if (discussion) discussion.visible = false;
  send('discussion', null);
});
ipcMain.on('ask', async (_event, value) => {
  const thread = discussion;
  const prompt = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
  if (!thread?.visible || thread.request || !prompt || !process.env.ANTHROPIC_API_KEY) return;
  thread.request = new AbortController();
  thread.pending = prompt;
  thread.partial = '';
  thread.error = '';
  thread.failedPrompt = '';
  publishDiscussion();
  try {
    const context = monitor.coding?.id === thread.review.problemId ? monitor.coding?.context : undefined;
    const reply = await answerFollowUp({ ...thread.review, context }, thread.turns.slice(-8), prompt, thread.request.signal, text => {
      thread.partial = text;
      if (discussion === thread && thread.visible) send('reply-text', text);
    });
    thread.turns.push({ role: 'user', content: prompt }, { role: 'assistant', content: reply });
    thread.turns = thread.turns.slice(-40);
  } catch (error) {
    thread.error = errorMessage(error);
    thread.failedPrompt = prompt;
  } finally {
    if (thread === discussion) {
      thread.pending = '';
      thread.request = null;
      publishDiscussion();
    }
  }
});

ipcMain.on('note', (_event, value) => monitor.setNote(String(value || '').slice(0, 2000)));
ipcMain.on('live', (_event, enabled) => {
  if (!enabled) monitor.stop();
  else if (process.env.ANTHROPIC_API_KEY) monitor.start();
});
ipcMain.on('finish', () => {
  monitor.stop();
  monitor.clearQuestion();
});
ipcMain.on('analyze', runAnalysis);
ipcMain.on('hide', () => {
  if (!unavailableShortcuts.includes('H')) win.hide();
});
ipcMain.on('clear', () => monitor.clearQuestion());
ipcMain.on('quit', () => app.quit());
ipcMain.on('click-through', () => {
  if (!unavailableShortcuts.includes('K')) toggleClickThrough();
});

app.whenReady().then(() => {
  // No Dock icon and no Cmd+Tab entry.
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
  registerShortcuts();
  // Debug: OVERLAY_AUTOCHECK=1 npm start runs one check shortly after launch.
  if (process.env.OVERLAY_AUTOCHECK) setTimeout(runAnalysis, 3000);
});

app.on('will-quit', () => { monitor.stop(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
