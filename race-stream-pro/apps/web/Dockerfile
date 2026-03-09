# ── deps: 依存インストールのみ（dev用マウント起動に使う）
FROM node:20-slim AS deps
WORKDIR /workspace
COPY package.json ./
RUN npm install

# ── build: 本番ビルド
FROM node:20-slim AS build
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
RUN npm run build

# ── production: スタンドアロン起動
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/.next/standalone ./
COPY --from=build /workspace/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
