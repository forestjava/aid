FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

# Copy shared package (from project root context) — leverages docker cache
COPY runner/shared /app/shared

# Copy runner's package definition and install
COPY runner/runner-prisma/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install

# Copy runner source
COPY runner/runner-prisma/. /app/runner/

EXPOSE 3004
CMD ["npm", "start"]
