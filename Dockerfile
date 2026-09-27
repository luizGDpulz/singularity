# ==============================================================================
# Multi-stage Dockerfile for Singularity Bridge (using pnpm)
# Base: Alpine Linux (Node 20), ARM64 & x86_64 compatible
# ==============================================================================

# --- Stage 1: Build & Compilation ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@11.3.0

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install all dependencies (including devDependencies for compilation)
RUN pnpm install --frozen-lockfile

# Copy source and TypeScript configuration
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN pnpm run build

# --- Stage 2: Lean Production Runtime ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime utilities and glibc compatibility for Linux CLI binaries
RUN apk update && \
    apk add --no-cache \
      bash \
      git \
      curl \
      ca-certificates \
      libc6-compat \
      gcompat && \
    rm -rf /var/cache/apk/*

# Install pnpm globally in runner stage
RUN npm install -g pnpm@11.3.0

# Set production environment and include Antigravity CLI path
ENV NODE_ENV=production
ENV PATH="/root/.gemini/bin:${PATH}"

# Copy package manifests and install only production dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create base directories for workspaces and persistent data
RUN mkdir -p /app/workspaces /app/data /workspace

# Run via node directly
CMD ["node", "dist/index.js"]
