FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json tsconfig.json ./
COPY src/ src/

RUN npm install --omit=dev
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY package.json ./

ENV NODE_ENV=production

EXPOSE 9090

CMD ["node", "dist/index.js"]
