FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN npm install --workspace=packages/shared --workspace=backend
COPY packages/shared packages/shared
COPY backend backend
RUN npm --workspace=packages/shared run build && npm --workspace=backend run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/dist ./backend/dist
COPY database/migrations ./database/migrations
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
