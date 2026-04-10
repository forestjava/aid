FROM node:22-alpine
RUN apk add --no-cache git openssh-client ca-certificates
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
