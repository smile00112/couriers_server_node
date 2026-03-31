#!/bin/sh
set -e

echo "Running database migrations..."
pnpm migration:run

echo "Starting NestJS..."
exec node dist/src/main
