# Jaartal

A private app for practising Hitster with the Dutch editions. Live at https://jaartal.elbra.nl.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in the publishable key from Vercel or Supabase
npm run dev
```

| Command | What |
|---|---|
| `npm run dev` | Local server on http://localhost:3000 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest |

## Database

Migrations live in `supabase/migrations`. Add one with `npx supabase migration new <name>`. They reach the database only through the **Migrations** GitHub Action after a merge to `main`. See `docs/setup.md`.

Product docs: `GLOSSARY.md`, `docs/spec/`, `docs/adr/`.
