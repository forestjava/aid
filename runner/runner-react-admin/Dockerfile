FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY runner/shared /app/shared

COPY runner/runner-react-admin/package*.json /app/runner/
WORKDIR /app/runner
RUN npm install

COPY runner/runner-react-admin/. /app/runner/

EXPOSE 3006
CMD ["npm", "start"]
