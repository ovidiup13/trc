FROM oven/bun:1.3.6

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

WORKDIR /app/apps/server

CMD ["bun", "run", "src/index.ts"]
