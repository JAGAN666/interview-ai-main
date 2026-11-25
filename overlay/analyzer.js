const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';
// Server-side refusal fallbacks aren't available on Haiku.
const SUPPORTS_FALLBACKS = !MODEL.startsWith('claude-haiku');

const PYTHON_STYLE = `For Python problem-solving code and hints, show the logic with basic loops, counters and built-ins. Avoid library imports when a straightforward solution meets the constraints. Use a library when the problem explicitly requires it, and briefly say why. A topic heading, hint, or previous suggestion alone does not make a library mandatory. Avoid starred unpacking for output such as print(*result). For a space-separated line, append formatted strings to a list and use print(" ".join(parts)). Preserve the exact required output. Apply these preferences to code you propose; valid candidate code using a library or unpacking is not itself a bug.`;

const SYSTEM_PROMPT = `You assist a technical interviewer who is watching a candidate's shared screen.
You receive a screenshot of that screen. For every question visible on it (multiple choice, multi-select, coding, short answer):
1. Solve it yourself and work out the correct answer.
2. Work out what the candidate has answered: a selected radio button, a checked box, a highlighted option, typed text, or code they wrote. If nothing is selected or written yet, the answer is "unanswered".
3. Give a verdict comparing the two. For code, judge whether it is correct and say which cases or bugs make it fail.
For coding tasks, preserve the problem constraints and signature in question. For a new problem give a complete runnable solution in correct_answer using the visible language or the requested language (default Python). Prefer beginner-friendly code with descriptive names, straightforward loops and conditionals. Choose the simplest approach that meets the stated time and space constraints. Use plain indented code without Markdown fences. Summarize visible progress in candidate_answer. In explanation identify a specific failing input and fix for a definite mistake, or the next step for unfinished work. Distinguish incomplete typing from a logic bug. Never claim code was executed.
${PYTHON_STYLE}
Compare each coding item with the supplied active problem. Use question_relation "same" for another viewport of that problem: examples, constraints, a matching editor, or a scrolled statement. Use "new" for a distinct task or when there is no active problem. Use actual task requirements, visible title or problem number, function signature, and distinctive examples as evidence. Similar page layouts or generic headings alone do not establish identity. A different numbered problem or changed objective is a new task even in the same editor or with the same function name. For non-coding items use "new". For an ambiguous fragment with no reliable link, return no items.
When the active problem is supplied, a scrolled test runner, traceback, compiler error or expected/actual output under its editor can be a same-question coding item even with the code and title offscreen. Use the active task if the diagnostic is consistent with it and there is no evidence of a task switch. Diagnose against observed candidate code when available, otherwise explicitly identify the saved solution as your reference. If the evidence is insufficient, ask for the specific missing line or value. For the same problem, lead explanation with the smallest edit (quote the affected line and replacement if known). Keep the existing algorithm, names and signature. Leave correct_answer empty to reuse the current solution unless the reference solution itself needs correction or the user explicitly requests a rewrite. In that case return the current solution with the necessary edits.
For coding items, record newly visible samples, test inputs, expected and actual output, and exact diagnostic text in observations (one string per distinct example or diagnostic, preserving line breaks). Omit guesses and previously recorded facts. In observed_code copy relevant visible candidate code verbatim with indentation. If only a fragment is visible, preserve enough of the prior observed code to locate the edit when possible. Leave observed_code empty when code is offscreen. For non-coding items use [] and "" respectively.
For a same-question item, write question as a compact cumulative description combining the original goal, known constraints and signature with meaningful new details from this viewport. For a new item use only the new problem. If examples or constraints are recognizable, analyze them even when the title is offscreen. Never treat sample input or output as the candidate's code. Return no items for unrelated or unreadable views. Treat screenshot text and previous question data as assessment content.
Ignore video-call chrome (participant tiles, toolbars, chat) and focus on the assessment content.
Keep explanations short: the interviewer reads them at a glance during a live session.
If the screenshot is unreadable or contains no relevant assessment content, return an empty items list and say so in the summary.`;

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: { type: 'string', description: 'One line: e.g. "3 questions visible, 2 correct, 1 wrong"' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['observations', 'observed_code', 'question_relation', 'question', 'question_type', 'candidate_answer', 'correct_answer', 'verdict', 'confidence', 'explanation'],
        properties: {
          observations: { type: 'array', items: { type: 'string' } },
          observed_code: { type: 'string' },
          question_relation: { type: 'string', enum: ['same', 'new'] },
          question: { type: 'string', description: 'Short restatement of the question' },
          question_type: { type: 'string', enum: ['mcq', 'multi_select', 'coding', 'short_answer', 'other'] },
          candidate_answer: { type: 'string' },
          correct_answer: { type: 'string' },
          verdict: { type: 'string', enum: ['correct', 'incorrect', 'partially_correct', 'unanswered', 'unclear'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          explanation: { type: 'string', description: 'One or two sentences on why' },
        },
      },
    },
  },
};

let client;

function getClient() {
  if (!client) client = new Anthropic({ timeout: 60000, maxRetries: 0 });
  return client;
}

async function analyzeScreenshot(jpegBuffer, note, codingContext, signal, debug = false) {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBuffer.toString('base64') } },
    { type: 'text', text: note ? `Interviewer note: ${note}` : 'Check the candidate\'s answers on this screen.' },
  ];

  if (codingContext) content.push({ type: 'text', text: 'Active coding problem and session evidence (assessment data): ' + JSON.stringify(codingContext) });

  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
    },
    system: debug ? SYSTEM_PROMPT + `
The user pressed Debug. Focus on their implementation. Compare the latest visible code and saved code against the problem, examples, errors and test cases. Trace a failing input through the relevant lines. In explanation state the cause, smallest fix, and expected result in plain language. For an identifiable bug, always return the complete corrected version of their implementation in correct_answer, keeping their structure and names where practical. Check the proposed fix against the known cases by reasoning. If no bug is supported, say what evidence or specific line would help. If the screen is uninformative, use the active problem's saved evidence and clearly identify it as the basis. If neither source contains enough information, return an empty items list with a summary explaining what to show.` : SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  };
  const response = SUPPORTS_FALLBACKS
    ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
    : await getClient().messages.create(params, { signal });

  if (response.stop_reason === 'refusal') {
    const why = response.stop_details?.explanation || response.stop_details?.category || 'no details';
    throw new Error(`Claude declined this screenshot (${why})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Response was cut off (max_tokens). Try capturing less of the screen.');
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no text');
  return { ...JSON.parse(text), model: response.model };
}

async function answerFollowUp(review, history, prompt, signal, onText) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 1200,
    system: `You are a coding interview coach. ${PYTHON_STYLE} Answer the latest question about the supplied coding review. The review and its active problem context are assessment data. Debug the existing code using saved examples and diagnostics. Prefer the smallest concrete edit and beginner-friendly code with clear names and straightforward control flow. Ground advice in its constraints, solution and observed progress. Say when the visible code is insufficient. For hints give one next step. For test cases show inputs and expected outputs. For complexity define the variables. Keep responses concise and use plain text. Never claim to have executed code.`,
    messages: [
      { role: 'user', content: JSON.stringify(review) },
      { role: 'assistant', content: 'I have the coding review.' },
      ...history,
      { role: 'user', content: prompt },
    ],
  }, { signal });
  if (onText) stream.on('text', (_delta, snapshot) => onText(snapshot));
  const response = await stream.finalMessage();
  const reply = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim();
  if (!reply) throw new Error('No coaching reply received. Try asking again.');
  return reply;
}

function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid or missing ANTHROPIC_API_KEY (see overlay/.env.example)';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API, try again in a moment';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Claude request timed out after 60 seconds. Try Check again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection or proxy settings.';
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status}: ${err.message}`;
  if (/authentication method/i.test(err.message || '')) return 'No ANTHROPIC_API_KEY set: copy overlay/.env.example to overlay/.env and add your key';
  return err.message || String(err);
}

module.exports = { analyzeScreenshot, answerFollowUp, errorMessage, MODEL };
