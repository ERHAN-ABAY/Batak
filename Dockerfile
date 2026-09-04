FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/engine packages/engine
COPY packages/server packages/server
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/engine/package.json packages/engine/package.json
COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/packages/server/package.json packages/server/package.json
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/public packages/server/public

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
