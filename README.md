# Adversarial Prompt Lab

An interactive, **100% client-side** teaching tool for modern LLM and AI-agent attacks.
Twelve labs across indirect prompt injection, MCP tool poisoning, excessive agency,
the lethal trifecta, RAG/memory poisoning, zero-click exfiltration, and more. Each lab
is a concept explainer **plus a live sandbox agent** you attack with your own API key —
then flip a "Defense" switch and watch the same attack fail.

Built for a YouTube audience: explain, then *show it actually happening* against a real model.

## Run it

It's static files — no build step, no backend. But **don't open `index.html` with `file://`**
(browsers block API calls from `file://` origins). Serve it over http:

```bash
cd "prompt playground"
python3 -m http.server 5173
# open http://localhost:5173
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## Use it

1. Open **Settings**, pick a provider (Groq, OpenAI, Anthropic, or Google Gemini),
   paste your API key, and **Test connection**.
2. Go to **Learn**, pick a lab, read the concept.
3. Hit **Run attack**. The real model plays a small agent; a judge inspects its output
   and tool calls and rules **Breached** or **Held**.
4. Toggle **Defense** on and run again. Compare.

The key lives in your browser's `localStorage` and is sent **only** to the provider you
picked — check your network tab. There is no server in this project.

## Deploy (make it public)

It's static, so anything works:

- **Vercel / Netlify / Cloudflare Pages / GitHub Pages** — point at this folder, no build command, output = root.
- The end user brings their **own** key at runtime, so you ship **no** secrets.

## Security notes

- **The `.env` in this repo was for the old idea and is gitignored.** If a real key was
  ever committed, rotate it — deleting the file doesn't remove it from git history.
- All attacks use a **benign canary** (a fake secret / the `I have been PWNED` marker),
  not real harmful content. This teaches control-bypass safely.
- Providers are called directly from the browser with CORS-enabled endpoints. Anthropic
  requires the `anthropic-dangerous-direct-browser-access` header, which is set for you.

## Files

```
index.html        markup + three tabs (Learn / Lab / Settings)
styles.css        light+dark theme, all tokens
js/providers.js   adapters for Groq / OpenAI / Anthropic / Gemini + one callModel()
js/labs.js        the curriculum: concepts, sandbox agents, and judges
js/app.js         routing, theme toggle, settings, the lab runner
```

Built by AI Anytime with ❤️
