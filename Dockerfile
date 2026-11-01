# Back-office Payload CMS (Next.js) — Convention CRN 2026, lot L3.
FROM node:22-bookworm-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/payload.config.ts ./payload.config.ts
COPY --from=build /app/src ./src

EXPOSE 3001
# Les migrations de schéma s'appliquent automatiquement au démarrage (instrumentation.ts).
CMD ["npm", "run", "start"]
