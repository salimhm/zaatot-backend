FROM oven/bun:1.3.13-slim AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.13-slim AS release
WORKDIR /app

COPY --from=install /app/node_modules node_modules
COPY src ./src
COPY tsconfig.json ./

ENV NODE_ENV=production

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/app.ts"]