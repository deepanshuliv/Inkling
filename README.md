# Inkling

Describe an app in plain words. An AI agent writes the code, runs it in a cloud sandbox and shows you the live result.

https://github.com/user-attachments/assets/d19487fd-61be-4092-8f7a-ba1b2025786e

## Features

- **Prompt to running app** from one sentence, with every step streamed into the chat
- **Self-checking agent** that confirms every page loads and fixes errors before it finishes
- **Live preview** in desktop, tablet and phone sizes
- **Follow-up changes** in Build mode, or a plan first in Plan mode
- **Free credits or your own key** for OpenRouter, OpenAI, Anthropic, Gemini or DeepSeek
- **Encrypted app secrets** for the keys a generated app needs
- **Save to GitHub** in a new or existing repository
- **Dashboard** with search, list and card views, and light and dark themes

## Quick start

You need [Bun](https://bun.sh) 1.3+, [Docker](https://docs.docker.com/get-docker/), and keys from [Daytona](https://app.daytona.io), [Clerk](https://dashboard.clerk.com) and [OpenRouter](https://openrouter.ai/keys).

```bash
git clone https://github.com/deepanshuliv/my-lovable.git
cd my-lovable
bun install
cp .env.example .env
```

Fill in the required variables below, then:

```bash
docker compose up -d postgres redis
bun run dev:backend
bun run dev:worker
bun run dev:web
```

Run the last three commands in separate terminals, then open http://localhost:3001. `dev:backend` applies the database migrations on start.

### Run everything in Docker

```bash
docker compose up -d --build
```

Open http://localhost:8080. Set `NEXT_PUBLIC_API_URL=http://localhost:8080` first.

### Faster sandboxes

```bash
bun run bake:snapshot
```

Then set `TEMPLATE_SOURCE=snapshot` and `TEMPLATE_SNAPSHOT=<name>` in `.env`.

## Environment variables

All variables go in the root `.env`. `.env.example` lists every option with a working default.

### Required

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | From [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DAYTONA_API_KEY` | From the Daytona dashboard |
| `SECRETS_MASTER_KEY` | Output of `openssl rand -base64 32` |
| `CLERK_SECRET_KEY` | Clerk dashboard, `sk_...` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard, `pk_...` |
| `DATABASE_URL` | `postgresql://inkling:inkling@localhost:5432/inkling` |
| `REDIS_URL` | `redis://localhost:6379` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` locally, `http://localhost:8080` in Docker |

### Optional

| Variable | Purpose |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 snapshots for faster project reloads |
| `REDIS_IRIS_URL`, `REDIS_IRIS_API_KEY` | Redis Iris agent memory, otherwise plain Redis |
| `TEMPLATE_SOURCE`, `TEMPLATE_SNAPSHOT` | Start sandboxes from a baked snapshot |
| `OPENROUTER_MODEL` | Free model used for platform credits |
| `PLATFORM_CREDIT_UNITS` | Credits each new user gets |
| `CLERK_AUTHORIZED_PARTIES`, `CORS_ORIGIN` | Allowed origins for auth and API calls |
| `NEXT_PUBLIC_CREDITS_REQUEST_EMAIL` | Where users ask for more credits |

## Scripts

| Command | Action |
|---|---|
| `bun run dev` | Start every app |
| `bun run db:sync` | Apply migrations |
| `bun run db:migrate --name <change>` | Create a migration |
| `bun test` | Run tests |
| `bun run typecheck` | Type-check |
| `bun run eval` | Run end-to-end evals |
