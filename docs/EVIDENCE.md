# Evidence manifest

Baseline inspected: `10bac0a` on `main` (`https://github.com/Kozphy/care-ai-support`). The worktree matched that commit. No OpenAI request was made for this change.

## Observed before this branch

`cbec016` committed source that ends mid-token. `package.json` and `package-lock.json` both stop inside the `wrangler` entry. `npm install` could not parse either file. The lockfile's root package record, which is intact, lists `wrangler` `4.92.0` and the same direct dependencies as the truncated `package.json`.

These files also stopped mid-token: `worker/index.ts`, `vite.config.ts`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `drizzle.config.ts`, `drizzle/meta/_journal.json`, `db/index.ts`, `build/sites-vite-plugin.ts`, `app/chatgpt-auth.ts`, `examples/d1/db/schema.ts`, `examples/d1/app/api/notes/route.ts`.

These files were already complete: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `db/schema.ts`, `drizzle/0000_kozphy_care.sql`, `tests/rendered-html.test.mjs`, `README.md`, `.env.example`, `.openai/hosting.json`.

## Reconstruction

The missing suffixes are reconstructed from the surviving source and the installed `@cloudflare/vite-plugin` `1.37.1` type declarations. They are not recovered git history.

| File | Reconstructed suffix |
|---|---|
| `package.json` | Closed `wrangler` at `4.92.0` and the dependency objects. Vinext's build then added `"type": "module"`, which it requires to load the Vite config. |
| `package-lock.json` | Regenerated with `npm install`. The previous file ended inside an integrity hash, so it could not be repaired in place. |
| `worker/index.ts` | Closed the worker object and added `export default worker`. |
| `vite.config.ts` | Passed the existing `localBindingConfig` through `cloudflare({ config })`. That option is `PluginConfig.config` in the installed plugin. |
| `tsconfig.json` | Closed the root object and added `"exclude": ["node_modules"]` so `**/*.ts` does not include dependencies. |
| `next.config.ts` | `export default nextConfig;` |
| `postcss.config.mjs` | `export default config;` |
| `eslint.config.mjs` | `export default eslintConfig;` |
| `drizzle.config.ts` | Closed the config object. |
| `drizzle/meta/_journal.json` | Closed the journal object. |
| `db/index.ts` | `return drizzle(env.DB, { schema });` |
| `build/sites-vite-plugin.ts` | `recursive: true` and closed the plugin function. |
| `app/chatgpt-auth.ts` | `safeDecodeURIComponent` returns `decodeURIComponent` or `null`. |
| `examples/d1/db/schema.ts` | Closed the table definition. |
| `examples/d1/app/api/notes/route.ts` | Closed the POST error path using the same shape as the complete GET handler. |
| `.gitignore` | Ignored `/dist/` and `/.wrangler/` so the build output stays untracked. |

## Verification

Local command: `npm test` on Node `v24.18.0`.

The command checks that the manifests parse, builds with Vinext, server-renders the existing page, and calls the built worker with no API key:

- `GET /api/status` returns `{ "ai": false, "tickets": false }`.
- `POST /api/chat` for a plan question returns `source: "knowledge_base"` and mentions `Starter`.
- An empty chat message returns `400`.
- `POST /api/tickets` without a D1 binding returns `503`.

This does not show a successful live model call, a product catalog, tool use, or an evaluation result.
