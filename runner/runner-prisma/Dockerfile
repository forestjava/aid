FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx prisma --version || true
COPY . .
EXPOSE 3004
CMD ["npm", "start"]
