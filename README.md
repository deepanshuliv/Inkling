# Inkling

Describe an app in plain words. An AI agent writes the code, runs it in a cloud sandbox and shows you the live result.

https://github.com/user-attachments/assets/d19487fd-61be-4092-8f7a-ba1b2025786e

**Stack:** Bun, Next.js 15, Express, Prisma, Postgres, Redis, Clerk, Daytona, OpenRouter

## Features

- **Prompt to running app** from one sentence, with every step streamed into the chat
- **Self-checking agent** that confirms every page loads and fixes errors before it finishes
- **Live preview** in desktop, tablet and phone sizes
- **Follow-up changes** in Build mode, or a plan first in Plan mode
- **Free credits or your own key** for OpenRouter, OpenAI, Anthropic, Gemini or DeepSeek
- **Encrypted app secrets** for the keys a generated app needs
- **Save to GitHub** in a new or existing repository
- **Dashboard** with search, list and card views, and light and dark themes

## How it works

```
browser ──► web (Next.js, :3001)
   │
   └──────► backend (Express, :8000) ──► Daytona sandbox (generated app, :3000 inside)
               │        │                      ▲
               │        └── preview proxy :8001┘
               ▼
          Redis stream ──► worker ──► Postgres
```

1. The web app sends your prompt to the backend, authenticated with a Clerk session token.
2. The backend runs the agent loop: it calls the model, executes tool calls (write files, run commands, install packages) inside a Daytona sandbox, and streams every step back to the browser over SSE.
3. Each step is written to a Redis stream. The worker reads the stream in batches and persists it to Postgres, which is the source of truth for projects, history, credits and secrets.
4. Before finishing a turn the agent verifies that every page loads, repairs errors, and commits the result to git inside the sandbox.
5. The preview proxy serves the sandbox's dev server at `http://<project-id>.preview.localhost:8001`.

In Docker, nginx on port 8080 sits in front of two backend replicas and the web app. A project is owned by one backend at a time through a Redis lease.

## Quick start

You need [Bun](https://bun.sh) 1.3+, [Docker](https://docs.docker.com/get-docker/), and keys from [Daytona](https://app.daytona.io), [Clerk](https://dashboard.clerk.com) and [OpenRouter](https://openrouter.ai/keys).

```bash
git clone https://github.com/deepanshuliv/my-lovable.git
cd my-lovable
bun install
cp .env.example .env
```

Fill in the [required variables](#required), then:

```bash
docker compose up -d postgres redis
bun run dev:backend
bun run dev:worker
bun run dev:web
```

Run the last three commands in separate terminals, then open http://localhost:3001. `dev:backend` applies the database migrations on start. `bun run dev` starts all three in one terminal instead.

### Run everything in Docker

```bash
docker compose up -d --build
```

Open http://localhost:8080. The web container reads the API address from `PUBLIC_API_URL`, which defaults to `http://localhost:8080`, so leave it unset unless you change `GATEWAY_PORT`.

### Faster sandboxes

New sandboxes normally copy the template and run `npm install`, which takes a while. A snapshot is a Daytona image with the template and its dependencies already installed.

```bash
bun run bake:snapshot
```

The script prints the snapshot name when it finishes. Then set `TEMPLATE_SOURCE=snapshot` and `TEMPLATE_SNAPSHOT=<name>` in `.env`.

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
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` (local only, Docker uses `PUBLIC_API_URL`) |

### Optional

| Variable | Purpose |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 snapshots for faster project reloads |
| `REDIS_IRIS_URL`, `REDIS_IRIS_API_KEY` | Redis Iris agent memory, otherwise plain Redis |
| `TEMPLATE_SOURCE`, `TEMPLATE_SNAPSHOT` | Start sandboxes from a baked snapshot |
| `OPENROUTER_MODEL` | Free model used for platform credits |
| `PLATFORM_CREDIT_UNITS` | Credits each new user gets |
| `CLERK_AUTHORIZED_PARTIES`, `CORS_ORIGIN` | Allowed origins for auth and API calls |
| `CLERK_JWT_KEY` | Verify Clerk tokens offline |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the web app, used for page metadata |
| `NEXT_PUBLIC_CREDITS_REQUEST_EMAIL` | Where users ask for more credits |
| `PUBLIC_API_URL`, `GATEWAY_PORT` | API address and nginx port in Docker |
| `PREVIEW_PROXY_URL`, `PREVIEW_PROXY_PORT` | Preview address pattern, or `off` to use Daytona URLs directly |
| `STRICT_OWNERSHIP` | Never take over a project lease held by another backend |

`.env.example` also groups the tuning knobs:

- **Sandbox size:** `SANDBOX_IMAGE`, `SANDBOX_CPU`, `SANDBOX_MEMORY_GIB`, `SANDBOX_DISK_GIB`
- **Agent limits:** `MAX_AGENT_TURNS`, `AGENT_MAX_TURN_COST_USD`, `COMMAND_TIMEOUT_SECONDS`, `VERIFY_REPAIR_ROUNDS`, `REPAIR_MAX_TURNS`
- **Context and compaction:** `KEEP_RECENT_TOKENS`, `SUMMARY_MAX_TOKENS`, `AGENT_COMPACTION_FRACTION`, `*_CONTEXT_WINDOW`
- **Free model quota:** `FREE_MODEL_RPM`, `FREE_MODEL_DAILY_REQUESTS`, `FREE_MODEL_DAILY_RESERVE`
- **Pricing:** `*_INPUT_PRICE_PER_M`, `*_OUTPUT_PRICE_PER_M`

## Ports

| Port | Service |
|---|---|
| 3001 | Web app (local) |
| 8000 | Backend API (local) |
| 8001 | Preview proxy |
| 8080 | nginx gateway (Docker) |
| 5432 | Postgres |
| 6379 | Redis |

## Scripts

| Command | Action |
|---|---|
| `bun run dev` | Apply migrations, then start backend, worker and web |
| `bun run dev:backend` | Apply migrations, then start the backend |
| `bun run dev:worker` | Start the worker |
| `bun run dev:web` | Start the web app |
| `bun run db:sync` | Apply migrations |
| `bun run db:migrate --name <change>` | Create a migration |
| `bun run db:generate` | Regenerate the Prisma client |
| `bun run db:push` | Push the schema without a migration (prototyping only) |
| `bun run bake:snapshot` | Bake a Daytona snapshot of the template |
| `bun run infra:up` | Build and start everything in Docker |
| `bun run infra:down` | Stop the Docker stack |
| `bun run infra:logs` | Follow Docker logs |
| `bun test` | Run tests |
| `bun run typecheck` | Type-check |
| `bun run eval` | Run end-to-end evals |

Evals call the real model and start throwaway Docker containers in place of Daytona. See [evals/README.md](evals/README.md) for options and spending caps.

## Costs and limits

- **Daytona** bills for running sandboxes. Each one gets 2 CPU, 4 GiB RAM and 3 GiB disk by default. Sandboxes stop when nobody has the project open.
- **Platform credits** run only on free OpenRouter models. OpenRouter allows about 20 requests a minute and 1,000 a day on free models, so a busy instance runs out. Users can add their own key for any supported provider.
- **`AGENT_MAX_TURN_COST_USD`** caps the cost of a single agent turn on a user's own key.

## Contributing

1. Branch from `main`.
2. Run `bun test` and `bun run typecheck` before opening a pull request.
3. Change the schema in `packages/db/prisma/schema.prisma`, then run `bun run db:migrate --name <change>` and commit the migration.
4. Code in this repo has no comments. Use clear names instead.
