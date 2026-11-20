// Renders a fake MCQ screen offscreen, sends it through the same analyzer the overlay uses,
// and prints Claude's verdicts. Run with: npm run selftest
const path = require('path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { app, BrowserWindow } = require('electron');
const { analyzeScreenshot, answerFollowUp, errorMessage } = require('./analyzer');

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

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    async function review(page, previousQuestion) {
      const win = new BrowserWindow({ width: 1000, height: 700, show: false, webPreferences: { offscreen: true } });
      const firstPaint = new Promise(resolve => win.webContents.once('paint', (_event, _rect, image) => resolve(image)));
      await win.loadURL('data:text/html,' + encodeURIComponent(page));
      await new Promise(resolve => setTimeout(resolve, 500));
      const image = await Promise.race([win.webContents.capturePage(), firstPaint]);
      assert.ok(!image.isEmpty(), 'Expected a rendered screenshot');
      const jpeg = image.toJPEG(85);
      win.destroy();
      return analyzeScreenshot(jpeg, '', previousQuestion);
    }

    const result = await review(PAGE);
    assert.deepEqual(result.items.map(item => item.verdict), ['correct', 'incorrect', 'unanswered']);
    console.log('Passed multiple-choice grading');

    const editor = code => `<pre style="font:24px monospace;padding:25px">${code}</pre>`;
    const prompt = '<h1>Python: implement add(a, b) to return the sum of two integers.</h1>';
    const buggy = await review(prompt + editor('def add(a, b):\n    return a - b'));
    const issue = buggy.items.find(item => item.question_type === 'coding');
    assert.ok(issue && ['incorrect', 'partially_correct'].includes(issue.verdict), 'Expected a coding correction');
    assert.match(issue.correct_answer, /def add/);
    console.log('Passed bug detection and reference solution');

    let partial = '';
    const reply = await answerFollowUp(issue, [], 'For add(7, 4), what should the result be and what does my buggy version return?', undefined, text => { partial = text; });
    assert.equal(partial.trim(), reply);
    assert.match(reply, /\b11\b/);
    assert.match(reply, /\b3\b/);
    console.log('Passed contextual coaching reply');

    const examples = await review(editor('Examples\nadd(4, -6) → -2\nadd(0, 0) → 0\nConstraints: operands can be negative.'), issue.question);
    const continuation = examples.items.find(item => item.question_type === 'coding');
    assert.equal(continuation?.question_relation, 'same');
    assert.match(continuation.question, /negative|signed|−|-/i);
    const fixed = await review(editor('def add(a, b):\n    return a + b'), continuation.question);
    assert.ok(fixed.items.some(item => item.question_type === 'coding' && item.verdict === 'correct'),
      'Expected corrected code to pass with the question offscreen');
    assert.equal(fixed.items[0].question_relation, 'same');
    const next = await review('<h1>Question 2. Return the product of two integers.</h1>' +
      editor('def multiply(a, b):\n    return a * b'), fixed.items[0].question);
    assert.equal(next.items[0].question_relation, 'new');
    assert.match(next.items[0].correct_answer, /multiply/);
    console.log('Passed scrolled examples, editor-only continuation and new problem detection');
  } catch (err) {
    console.error('FAILED:', errorMessage(err));
    process.exitCode = 1;
  }
  app.exit(process.exitCode || 0);
});
