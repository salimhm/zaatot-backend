FROM oven/bun:1.3.14-slim AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-slim AS build
WORKDIR /app
COPY --from=install /app/node_modules node_modules
COPY . .
RUN bun build --compile --minify-whitespace --minify-syntax --target bun --outfile bin src/app.ts

FROM oven/bun:1.3.14-slim AS release
WORKDIR /app

COPY --from=build /app/bin ./bin
COPY --from=install /app/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 3000

USER bun

CMD ["./bin"]
