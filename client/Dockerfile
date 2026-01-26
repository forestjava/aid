# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy shared files
COPY shared/ ./shared/

# Copy client files
COPY client/ ./client/

# Install dependencies and build
WORKDIR /app/client
RUN npm install
RUN npm run build

# Stage 2: Production
FROM nginx:latest

# Copy built files from builder stage
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
