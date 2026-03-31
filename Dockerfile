FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install ALL deps including devDeps — pnpm migration:run needs ts-node (devDep)
RUN pnpm install --frozen-lockfile

COPY . .

# Compile NestJS to dist/
RUN pnpm build

RUN chmod +x docker/entrypoint-prod.sh

EXPOSE 3000

ENTRYPOINT ["sh", "docker/entrypoint-prod.sh"]
