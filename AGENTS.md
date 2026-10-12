# Fireboard API Client

- Node 22+, TypeScript, ESM with NodeNext resolution. Relative imports use `.js` extensions.
- Commands: `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run smoke`, `npm pack`.
- `src/client.ts` owns API endpoints and device caching. `src/request.ts` handles HTTP and response decoding; `src/login.ts` handles authentication; `src/validation.ts` validates options and resource identifiers. `src/schemas.ts` validates raw Fireboard responses and exports their types. Keep MCP transformations, Winston, OAuth, Cloudflare, and environment variables out of this library.
- Preserve credential privacy. Do not log credentials or response bodies, automatically retry hardware writes, or run live Drive commands during checks.
- Maintain both source and tests type checks. Test meaningful HTTP behavior, cache isolation/expiry, response validation, and errors using injected fetch.
- API schemas should match observed Fireboard responses, including nullable unused probe slots and the single-object Drive log.
- Use conventional commits and PR titles. Releases follow Release Please; do not publish npm packages unless explicitly authorized.
