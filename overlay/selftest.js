// Renders a fake MCQ screen offscreen, sends it through the same analyzer the overlay uses,
// and prints Claude's verdicts. Run with: npm run selftest
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { app, BrowserWindow } = require('electron');
const { analyzeScreenshot, errorMessage } = require('./analyzer');

const PAGE = `<body style="font:20px sans-serif;padding:30px">
<h2>Python Assessment</h2>
<p><b>Q1.</b> What does <code>len([1, [2, 3], 4])</code> return?</p>
<label><input type=radio name=a> 2</label><br><label><input type=radio name=a checked> 3</label><br>
<label><input type=radio name=a> 4</label><br><label><input type=radio name=a> Error</label>
<p><b>Q2.</b> Which keyword defines a generator?</p>
<label><input type=radio name=b checked> return</label><br><label><input type=radio name=b> yield</label><br>
<label><input type=radio name=b> async</label>
<p><b>Q3.</b> Time complexity of looking up a key in a dict (average)?</p>
<label><input type=radio name=c> O(n)</label><br><label><input type=radio name=c> O(1)</label></body>`;

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1000, height: 700, show: false, webPreferences: { offscreen: true } });
    const firstPaint = new Promise((resolve) => win.webContents.once('paint', (_e, _dirty, image) => resolve(image)));
    await win.loadURL('data:text/html,' + encodeURIComponent(PAGE));
    await new Promise((r) => setTimeout(r, 500));
    const image = await Promise.race([win.webContents.capturePage(), firstPaint]);
    const jpeg = image.toJPEG(85);
    console.log(`captured ${image.getSize().width}x${image.getSize().height} (${jpeg.length} bytes), sending to Claude...`);
    const started = Date.now();
    const result = await analyzeScreenshot(jpeg, "");
    console.log(`Claude answered in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(result, null, 2));
    console.log('\nExpected: Q1 correct (3), Q2 incorrect (yield), Q3 unanswered (O(1))');
  } catch (err) {
    console.error('FAILED:', errorMessage(err));
    process.exitCode = 1;
  }
  app.quit();
});
