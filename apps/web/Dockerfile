FROM node:24-alpine AS dependencies
RUN corepack enable
WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY --from=dependencies /workspace/apps/web/node_modules apps/web/node_modules
COPY apps/web apps/web
WORKDIR /workspace/apps/web
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next-moneymentor/standalone ./
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/.next-moneymentor/static ./apps/web/.next-moneymentor/static
COPY --from=build --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
