FROM node:22 AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

 RUN npm run build
 RUN npm prune --production

FROM node:22-slim AS runner

RUN apt update && apt install -y git

RUN npm install -g @openai/codex

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["node", "/app/dist/index.js"]
