FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY runner/shared /app/shared

COPY runner/runner-nestjs/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install

COPY runner/runner-nestjs/. /app/runner/

EXPOSE 3005
CMD ["npm", "start"]
