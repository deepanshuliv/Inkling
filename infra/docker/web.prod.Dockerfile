FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/memory/package.json ./packages/memory/
COPY packages/redis/package.json ./packages/redis/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/

RUN bun install --frozen-lockfile

COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CREDITS_REQUEST_EMAIL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CREDITS_REQUEST_EMAIL=$NEXT_PUBLIC_CREDITS_REQUEST_EMAIL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

RUN bun run build

EXPOSE 3001

CMD ["bun", "run", "start"]
