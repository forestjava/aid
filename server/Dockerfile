FROM node:22-alpine

WORKDIR /app

# Copy shared files
COPY shared/ ./shared/

# Copy server files
COPY server/ ./server/

# Install dependencies and build
WORKDIR /app/server
RUN npm install
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
