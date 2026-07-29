# AI customer support center 

Traditional Chinese AI customer support center with:

- OpenAI Responses API integration through a server-only endpoint
- Safe knowledge-base fallback when no API key is configured
- D1-backed human handoff tickets
- Responsive, accessible chat interface

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add `OPENAI_API_KEY` to enable live AI replies.
4. Run `npm run dev`.

The default model is `gpt-5.6-luna`, selected for a high-volume support workload.
Set `OPENAI_MODEL` to override it.
