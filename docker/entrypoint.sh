#!/bin/sh
set -e

echo "Running database migrations..."
pnpm migration:run

echo "Starting NestJS in watch mode..."
exec pnpm start:dev
