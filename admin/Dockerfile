# Stage 1: Build Vite app
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# VITE_API_URL is baked into JS bundle at build time
ARG VITE_API_URL=https://new-cur.foodloveapp.ru/v1
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm build

# Stage 2: Serve static files via nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
