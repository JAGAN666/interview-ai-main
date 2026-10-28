const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';
// Server-side refusal fallbacks aren't available on Haiku.
const SUPPORTS_FALLBACKS = !MODEL.startsWith('claude-haiku');

const SYSTEM_PROMPT = `You assist a technical interviewer who is watching a candidate's shared screen.
You receive a screenshot of that screen. For every question visible on it (multiple choice, multi-select, coding, short answer):
1. Solve it yourself and work out the correct answer.
2. Work out what the candidate has answered: a selected radio button, a checked box, a highlighted option, typed text, or code they wrote. If nothing is selected or written yet, the answer is "unanswered".
3. Give a verdict comparing the two. For code, judge whether it is correct and say which cases or bugs make it fail.
Ignore video-call chrome (participant tiles, toolbars, chat) and focus on the assessment content.
Keep explanations short: the interviewer reads them at a glance during a live session.
If the screenshot is unreadable or contains no question, return an empty items list and say so in the summary.`;

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
        required: ['question', 'question_type', 'candidate_answer', 'correct_answer', 'verdict', 'confidence', 'explanation'],
        properties: {
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
  if (!client) client = new Anthropic();
  return client;
}

async function analyzeScreenshot(jpegBuffer, note) {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBuffer.toString('base64') } },
    { type: 'text', text: note ? `Interviewer note: ${note}` : 'Check the candidate\'s answers on this screen.' },
  ];

  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  };
  const response = SUPPORTS_FALLBACKS
    ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await getClient().messages.create(params);

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

function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Invalid or missing ANTHROPIC_API_KEY (see overlay/.env.example)';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API, try again in a moment';
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status}: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API (network)';
  if (/authentication method/i.test(err.message || '')) return 'No ANTHROPIC_API_KEY set: copy overlay/.env.example to overlay/.env and add your key';
  return err.message || String(err);
}

module.exports = { analyzeScreenshot, errorMessage, MODEL };
