FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

ENV NPM_CONFIG_REGISTRY=https://repo.huaweicloud.com/repository/npm/
RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_NEWAPI_BASE_URL=""

ENV NEXT_PUBLIC_NEWAPI_BASE_URL=${NEXT_PUBLIC_NEWAPI_BASE_URL}

RUN apk add --no-cache openssl

ENV NPM_CONFIG_REGISTRY=https://repo.huaweicloud.com/repository/npm/
RUN npm install -g pnpm@10.11.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/newapi_portal?schema=newapi_portal" \
    AUTH_SECRET="build-only-placeholder-secret-32-chars" \
    APP_URL="http://localhost:3000" \
    NEWAPI_BASE_URL="http://localhost:3001" \
    NEWAPI_ADMIN_TOKEN="build-only-placeholder" \
    NEWAPI_ADMIN_USER_ID="1" \
    pnpm build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV IMAGE_PLAYGROUND_INTERNAL_URL=""

RUN apk add --no-cache openssl \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
