# Atlas — AI-Powered Adaptive Learning Platform

## Setup (follow in order)

### Step 1 — Get your Supabase anon key

1. Open your Supabase project dashboard
2. Go to **Settings → API**
3. Copy the **"anon public"** key — it's a long JWT starting with `eyJ...`
   > ⚠️ The `sb_publishable_...` value is **not** the anon key. Look for "anon public".

### Step 2 — Disable email confirmation (for development)

1. Supabase Dashboard → **Authentication → Settings**
2. Toggle **"Confirm email"** → **OFF** → Save

### Step 3 — Run the database schema

1. Supabase Dashboard → **SQL Editor → New query**
2. Paste the full contents of `supabase/schema.sql`
3. Click **Run**

### Step 4 — Fill in `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://ljlnishgqqtsgcwzxing.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        ← paste the anon JWT here

OPENROUTER_API_KEY=sk-or-v1-...             ← your OpenRouter key
```

### Step 5 — Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## AI Model

All AI features use **OpenRouter** with `stepfun/step-3.5-flash:free` (free tier, no usage cost).

| Feature | Route | Description |
|---------|-------|-------------|
| Lesson Generation | `/api/ai/create-lesson` | Generates full lesson from URL / text / objectives |
| Socratic Tutor | `/api/ai/socratic` | Gives guiding hints, never answers directly |
| Analytics AI | `/api/ai/analytics` | Recommends interventions from class data |

To switch models, change the `MODEL` constant in `src/lib/openrouter.ts`.
Popular free alternatives on OpenRouter:
- `google/gemma-3-27b-it:free`
- `meta-llama/llama-4-scout:free`
- `mistralai/mistral-7b-instruct:free`

---

## What was fixed (vs original)

| Issue | Fix |
|-------|-----|
| Wrong Supabase schema (`users`/`roles`) | Full `schema.sql` with all 16 tables, triggers, RLS policies |
| `sb_publishable_...` key not working | `.env.local` documents exactly which key to use |
| Anthropic SDK → OpenRouter | Swapped all 3 AI routes; no extra package needed (uses `fetch`) |
| `useSearchParams` build error | Wrapped in `Suspense` (required by Next.js 14 App Router) |
| Email confirmation blocking login | Signup detects unconfirmed state; shows helpful screen |
| `increment_xp` RPC missing | Added to schema + app has direct-update fallback |
| Middleware double DB calls | Single `maybeSingle()` call per route check |
| `.single()` errors on missing profile | Changed to `maybeSingle()` throughout |
| Alert join query crash | Simplified to plain select |
| Invalid join code — no feedback | Now shows `toast.error` with message |
"# Comp3122_G13_Information-Systems-Development" 
