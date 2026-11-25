# Interview AI

## Live desktop screen answers

The Electron app in `overlay/` automatically watches the display under your mouse
pointer and answers visible questions when the screen changes. This is the screen
capture app; the React web app below provides microphone and typed-question input.

```sh
cd overlay
npm ci
# If not already configured, copy .env.example to .env and add ANTHROPIC_API_KEY.
npm start
```

Live mode starts automatically when an API key is configured. Use **Pause live**
or **Cmd/Ctrl+Shift+L** to pause/resume. **Check** / **Cmd/Ctrl+Shift+Enter** requests
an immediate analysis, including while paused. Set `OVERLAY_LIVE=0` in `.env`
to always start paused.

On macOS, allow Screen Recording for Electron (or its launching terminal) in
System Settings → Privacy & Security, then restart the app if requested.
Keep the question outside the overlay panel: that rectangle is masked from both
change detection and the image sent to Claude to prevent feedback loops.
Move the pointer to another display to watch that display.

Screens are sampled every second and compared locally. After a change settles,
the latest screenshot is sent to Claude; answer latency also depends on the API.
Only one analysis runs at a time, with the newest changed screen queued and
obsolete responses discarded. Unchanged screens do not trigger repeated API calls.
Errors are displayed and retried after a 10-second backoff. Live mode sends changed
screenshots to the configured Claude API and incurs normal API usage.

For a coding question, keep the prompt visible for the first check. The overlay shows a reference solution and reviews visible edits after you pause typing. You can scroll from the code to a traceback or test result. The overlay keeps the original solution, its latest revision, observed code, sample inputs and outputs, and reported failures in memory for the active problem. Follow-up reviews show the targeted fix first. The full solution appears directly below the feedback. Click **Debug** with your code or a failing test on screen to see the cause, a targeted fix, and beginner-friendly corrected code. Pausing live capture preserves this context. It keeps the prior review on ambiguous screens and starts a fresh problem context when the task changes. Choose **Finish coding** to clear the review and pause capture. Choose **Start live** to resume. Reviews use screenshots and do not execute your code.

Choose **Ask about this code** on a coding review to open a conversation about the active problem. Use **Give me a hint**, **Edge cases**, or **Time and space complexity**, or type a follow-up. Replies stream into the panel. **Back to live review** returns to the latest screen analysis. The conversation follows new reviews of the same problem. Each request uses the latest review, its saved coding context, and up to four earlier exchanges. Clear and Finish coding discard the discussion.

For best results, keep the question readable and pause unrelated animations or
video on the watched display. This detects visual changes, not just question text;
continuous changes can delay the current answer. Very small pixel changes may be
filtered as noise; use **Check** to force an analysis.

```sh
npm test             # offline live-monitor regression tests
npm run test:controls # Electron button, shortcut-handler and recovery tests (offline)
npm run selftest     # Electron + Claude grading and coding checks (requires key)
```

## Web app

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
