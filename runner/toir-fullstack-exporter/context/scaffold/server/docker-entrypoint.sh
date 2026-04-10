#!/bin/sh
set -e

# Apply any pending Prisma migrations before starting the app.
if [ -f "./prisma/schema.prisma" ]; then
  echo "[entrypoint] Running prisma migrate deploy"
  npx prisma migrate deploy || echo "[entrypoint] migrate deploy failed; continuing"
fi

exec "$@"
