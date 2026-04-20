# Multi-stage build for Tafweej Data Fusion Platform

# Stage 1: Build backend
FROM node:18-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production

# Stage 2: Build frontend
FROM node:18 AS frontend-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install

COPY client ./
RUN npm run build

# Stage 3: Production image
FROM node:18-alpine
WORKDIR /app

# Copy backend dependencies
COPY --from=backend-builder /app/node_modules ./node_modules
COPY package.json package-lock.json* ./

# Copy backend code
COPY server ./server

# Copy frontend build
COPY --from=frontend-builder /app/client/build ./client/build

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["node", "server/index.js"]
