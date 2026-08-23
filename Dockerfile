FROM oven/bun:1.4.0 AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN bun run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["bun", "run", "start", "--", "--port", "3000"]
