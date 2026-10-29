# ==============================================================================
# Multi-stage Dockerfile: Magento Flow Runner & Benchmarker
# ==============================================================================

# Stage 1: Build Frontend and Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install build dependencies
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Compile Client (Vite) and Server (TypeScript)
RUN cd client && npm run build
RUN cd server && npm run build

# Stage 2: Minimal Production Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Install production dependencies only
COPY package.json ./
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Copy compiled outputs from builder
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Copy data templates and seed files
COPY server/data ./server/data

# Ensure data directory has proper permissions
RUN mkdir -p /app/server/data

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
