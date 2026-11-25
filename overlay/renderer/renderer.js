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
let hasKey = true;

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
  $('finish').classList.toggle('hidden', !result.items.some(item => item.question_type === 'coding'));
  const summary = $('summary');
  summary.textContent = result.summary;
  summary.classList.remove('hidden');

  const results = $('results');
  results.replaceChildren();
  if (!result.items.length) {
    results.append(el('div', 'empty', 'No questions found on screen.'));
  }
  for (const [index, item] of result.items.entries()) {
    const card = el('div', `card ${item.verdict}`);
    const top = el('div', 'card-top');
    top.append(el('span', `verdict ${item.verdict}`, VERDICT_LABELS[item.verdict] || item.verdict));
    top.append(el('span', 'meta', `${item.question_type.replace('_', ' ')} · ${item.confidence} confidence`));
    card.append(top);
    card.append(el('div', 'question', item.question));

    const coding = item.question_type === 'coding';
    const feedback = el('div', 'explanation', item.explanation);
    if (coding) card.append(feedback);
    const answers = el('div', 'answers');
    answers.append(el('div', 'label', coding ? 'Your code' : 'Candidate'), el('div', 'value', item.candidate_answer || '—'));
    const solution = el(coding ? 'code' : 'div', 'value strong', item.correct_answer);
    if (item.continuation) {
      const details = el('details');
      details.append(el('summary', 'label', 'View full solution'), solution);
      answers.append(details);
    } else {
      answers.append(el('div', 'label', coding ? 'Solution' : 'Correct'), solution);
    }
    card.append(answers);
    if (!coding) card.append(feedback);
    if (coding) {
      const discuss = el('button', 'discuss', 'Ask about this code');
      discuss.addEventListener('click', () => window.overlay.openDiscussion(result.at, index));
      card.append(discuss);
    }
    results.append(card);
  }

  const time = new Date(result.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setStatus(`Checked ${time} · ${result.model || model}`, 'ok');
}

function clear() {
  $('error').classList.add('hidden');
  $('finish').classList.add('hidden');
  $('summary').classList.add('hidden');
  $('results').replaceChildren(el('div', 'empty', 'Cleared. Select Check to review the screen.'));
  if (hasKey) setStatus(live ? 'Live · watching for screen changes' : 'Paused · select Check or Start live');
  else setStatus('Set ANTHROPIC_API_KEY in overlay/.env and restart.', 'err');
}

window.overlay.on('config', (config) => {
  model = config.model;
  hasKey = config.hasKey;
  $('note').value = config.note;
  const prefix = config.platform === 'darwin' ? '⌘⇧' : 'Ctrl+Shift+';
  const shortcuts = { hide: 'H', analyze: 'Enter', live: 'L', 'click-through': 'K', clear: 'R', quit: 'Q' };
  for (const [id, key] of Object.entries(shortcuts)) {
    const unavailable = config.unavailableShortcuts.includes(key);
    $(id).title = unavailable ? 'Global shortcut unavailable' : prefix + key;
    if (id === 'hide' || id === 'click-through') $(id).disabled = unavailable;
  }
  $('analyze').disabled = $('live').disabled = !hasKey;
  $('move-hint').textContent = prefix + 'arrows to move';
  $('ct-badge').textContent = prefix + 'K to enable clicks';
  if (!$('hide').disabled) $('hide').title = 'Hide · ' + prefix + 'H to show again';
  if (config.unavailableShortcuts.length) {
    $('shortcut-warning').textContent = 'Unavailable shortcuts: ' + config.unavailableShortcuts.map(key => prefix + key).join(', ');
    $('shortcut-warning').classList.remove('hidden');
  }
  if (!config.hasKey) setStatus('Set ANTHROPIC_API_KEY in overlay/.env and restart.', 'err');
  else setStatus(`Ready · ${model}`);
});

window.overlay.on('status', ({ state }) => {
  const labels = { changed: 'Screen changed · waiting for latest answer…', analyzing: 'Claude is checking…', holding: 'Question out of view · keeping last coding review' };
  $('error').classList.add('hidden');
  setStatus(labels[state] || 'Capturing screen…', 'busy');
  if (state === 'changed' && $('finish').classList.contains('hidden')) {
    $('summary').classList.add('hidden');
    $('results').replaceChildren(el('div', 'empty', 'Screen changed. Updating answer…'));
  }
});

window.overlay.on('result', (result) => {
  renderResult(result);
});

window.overlay.on('error', ({ message }) => {
  setStatus(message, 'err');
  $('error').textContent = message;
  $('error').classList.remove('hidden');
});

window.overlay.on('clear', clear);
window.overlay.on('click-through', (on) => {
  $('ct-badge').classList.toggle('hidden', !on);
  $('click-through').setAttribute('aria-pressed', String(on));
});
$('click-through').addEventListener('click', () => window.overlay.clickThrough());
$('clear').addEventListener('click', () => window.overlay.clear());
$('quit').addEventListener('click', () => window.overlay.quit());

$('analyze').addEventListener('click', () => window.overlay.analyze());
$('finish').addEventListener('click', () => window.overlay.finish());
$('hide').addEventListener('click', () => window.overlay.hide());
$('note').addEventListener('input', (e) => window.overlay.setNote(e.target.value));
$('note').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && hasKey) window.overlay.analyze(); });

window.overlay.on('live', ({ enabled }) => {
  live = enabled;
  $('live').textContent = live ? 'Pause live' : 'Start live';
  $('live').setAttribute('aria-pressed', String(live));
  if (!hasKey) return;
  setStatus(live ? 'Live · watching for screen changes' : 'Live paused · press Check for an answer');
});
$('live').addEventListener('click', () => window.overlay.setLive(!live));

let wasDiscussing = false;
window.overlay.on('discussion', thread => {
  $('discussion').classList.toggle('hidden', !thread);
  document.querySelector('.panel').classList.toggle('discussing', Boolean(thread));
  if (!thread) {
    if (wasDiscussing) document.querySelector('.discuss')?.focus();
    $('messages').replaceChildren();
    $('prompt').value = '';
    wasDiscussing = false;
    return;
  }
  $('topic').textContent = thread.question;
  const messages = $('messages');
  messages.replaceChildren();
  for (const turn of thread.turns) {
    messages.append(el('p', turn.role, turn.content));
  }
  if (thread.pending) messages.append(el('p', 'user', thread.pending), el('p', 'waiting', thread.partial || 'Thinking…'));
  if (thread.error) {
    messages.append(el('p', 'reply-error', thread.error));
    if (!$('prompt').value) $('prompt').value = thread.failedPrompt || '';
  }
  messages.scrollTop = messages.scrollHeight;
  for (const button of $('discussion').querySelectorAll('#suggested button, #ask')) button.disabled = Boolean(thread.pending);
  if (!wasDiscussing) $('prompt').focus();
  wasDiscussing = true;
});
function ask(value) {
  if (!value.trim() || $('ask').disabled) return;
  $('ask').disabled = true;
  $('prompt').value = '';
  window.overlay.ask(value);
}
$('ask-form').addEventListener('submit', event => {
  event.preventDefault();
  ask($('prompt').value);
});
for (const button of $('suggested').querySelectorAll('button')) {
  button.addEventListener('click', () => ask(button.textContent));
}
$('back').addEventListener('click', () => window.overlay.closeDiscussion());

window.overlay.on('reply-text', text => {
  const messages = $('messages');
  const block = messages.querySelector('.waiting');
  if (!block) return;
  const follow = messages.scrollHeight - messages.clientHeight - messages.scrollTop < 24;
  block.textContent = text;
  if (follow) messages.scrollTop = messages.scrollHeight;
});
