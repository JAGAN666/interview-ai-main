const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, ipcMain, systemPreferences } = require('electron');
const { analyzeScreenshot, errorMessage, MODEL } = require('./analyzer');

const MOVE_STEP = 40;
const MAX_CAPTURE_WIDTH = 2400;

let win;
let note = '';
let clickThrough = false;
let busy = false;

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

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.showInactive();
    send('config', { model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

async function captureDisplayUnderCursor() {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    // Calling getSources triggers the permission prompt the first time.
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    throw new Error('Screen Recording permission needed: System Settings → Privacy & Security → Screen Recording → enable Electron, then restart the overlay.');
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture returned nothing');

  let image = source.thumbnail;
  if (image.getSize().width > MAX_CAPTURE_WIDTH) image = image.resize({ width: MAX_CAPTURE_WIDTH, quality: 'best' });
  return image.toJPEG(85);
}

async function runAnalysis() {
  if (busy) return;
  busy = true;
  console.log('[overlay] checking screen...');
  try {
    send('status', { state: 'capturing' });
    const jpeg = await captureDisplayUnderCursor();
    send('status', { state: 'analyzing' });
    const result = await analyzeScreenshot(jpeg, note);
    console.log(`[overlay] ${result.summary}`);
    send('result', { ...result, at: Date.now() });
  } catch (err) {
    console.error(`[overlay] error: ${errorMessage(err)}`);
    send('error', { message: errorMessage(err) });
  } finally {
    busy = false;
  }
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
  win.setPosition(x + dx, y + dy);
}

function registerShortcuts() {
  const shortcuts = {
    'CommandOrControl+Shift+Enter': runAnalysis,
    'CommandOrControl+Shift+H': toggleVisible,
    'CommandOrControl+Shift+K': toggleClickThrough,
    'CommandOrControl+Shift+R': () => send('clear'),
    'CommandOrControl+Shift+Up': () => move(0, -MOVE_STEP),
    'CommandOrControl+Shift+Down': () => move(0, MOVE_STEP),
    'CommandOrControl+Shift+Left': () => move(-MOVE_STEP, 0),
    'CommandOrControl+Shift+Right': () => move(MOVE_STEP, 0),
    'CommandOrControl+Shift+Q': () => app.quit(),
  };
  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accelerator, handler)) console.warn(`Shortcut ${accelerator} is taken by another app`);
  }
}

ipcMain.on('note', (_event, value) => { note = String(value || '').slice(0, 2000); });
ipcMain.on('analyze', runAnalysis);
ipcMain.on('hide', () => win.hide());

app.whenReady().then(() => {
  // No Dock icon and no Cmd+Tab entry.
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
  registerShortcuts();
  // Debug: OVERLAY_AUTOCHECK=1 npm start runs one check shortly after launch.
  if (process.env.OVERLAY_AUTOCHECK) setTimeout(runAnalysis, 3000);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
