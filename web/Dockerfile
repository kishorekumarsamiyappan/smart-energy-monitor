FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY web/package.json web/
RUN npm install --workspace=packages/shared --workspace=web
COPY packages/shared packages/shared
COPY web web
RUN npm --workspace=packages/shared run build && npm --workspace=web run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web ./web
COPY --from=builder /app/packages/shared ./packages/shared
EXPOSE 3000
CMD ["npm", "--workspace=web", "run", "start"]
