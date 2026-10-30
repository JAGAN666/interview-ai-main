const $ = (id) => document.getElementById(id);

const VERDICT_LABELS = {
  correct: '✓ Correct',
  incorrect: '✗ Incorrect',
  partially_correct: '◐ Partial',
  unanswered: '○ Unanswered',
  unclear: '? Unclear',
};

let model = '';
let live = false;

function setStatus(text, state) {
  $('status').textContent = text;
  $('status').title = text;
  $('dot').className = `dot ${state || ''}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResult(result) {
  $('error').classList.add('hidden');
  $('error').textContent = '';
  const summary = $('summary');
  summary.textContent = result.summary;
  summary.classList.remove('hidden');

  const results = $('results');
  results.replaceChildren();
  if (!result.items.length) {
    results.append(el('div', 'empty', 'No questions found on screen.'));
  }
  for (const item of result.items) {
    const card = el('div', `card ${item.verdict}`);
    const top = el('div', 'card-top');
    top.append(el('span', `verdict ${item.verdict}`, VERDICT_LABELS[item.verdict] || item.verdict));
    top.append(el('span', 'meta', `${item.question_type.replace('_', ' ')} · ${item.confidence} confidence`));
    card.append(top);
    card.append(el('div', 'question', item.question));

    const answers = el('div', 'answers');
    answers.append(el('div', 'label', 'Candidate'), el('div', 'value', item.candidate_answer || '—'));
    answers.append(el('div', 'label', 'Correct'), el('div', 'value strong', item.correct_answer));
    card.append(answers);
    card.append(el('div', 'explanation', item.explanation));
    results.append(card);
  }

  const time = new Date(result.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setStatus(`Checked ${time} · ${result.model || model}`, 'ok');
}

function clear() {
  $('summary').classList.add('hidden');
  $('results').replaceChildren(el('div', 'empty', 'Cleared. Press ⌘⇧↵ to check the screen.'));
  setStatus('Ready');
}

window.overlay.on('config', (config) => {
  model = config.model;
  if (!config.hasKey) setStatus('No ANTHROPIC_API_KEY set: see overlay/.env.example', 'err');
  else setStatus(`Ready · ${model}`);
});

window.overlay.on('status', ({ state }) => {
  const labels = { changed: 'Screen changed · waiting for latest answer…', analyzing: 'Claude is checking…' };
  setStatus(labels[state] || 'Capturing screen…', 'busy');
  if (state === 'changed') {
    $('summary').classList.add('hidden');
    $('results').replaceChildren(el('div', 'empty', 'Screen changed. Updating answer…'));
  }
});

window.overlay.on('result', (result) => {
  $('analyze').disabled = false;
  renderResult(result);
});

window.overlay.on('error', ({ message }) => {
  $('analyze').disabled = false;
  setStatus(message, 'err');
  $('error').textContent = message;
  $('error').classList.remove('hidden');
});

window.overlay.on('clear', clear);
window.overlay.on('click-through', (on) => $('ct-badge').classList.toggle('hidden', !on));

$('analyze').addEventListener('click', () => window.overlay.analyze());
$('hide').addEventListener('click', () => window.overlay.hide());
$('note').addEventListener('input', (e) => window.overlay.setNote(e.target.value));
$('note').addEventListener('keydown', (e) => { if (e.key === 'Enter') window.overlay.analyze(); });

window.overlay.on('live', ({ enabled }) => {
  live = enabled;
  $('live').textContent = live ? 'Pause live ⌘⇧L' : 'Start live ⌘⇧L';
  $('live').setAttribute('aria-pressed', String(live));
  setStatus(live ? 'Live · watching for screen changes' : 'Live paused · press Check for an answer');
});
$('live').addEventListener('click', () => window.overlay.setLive(!live));
