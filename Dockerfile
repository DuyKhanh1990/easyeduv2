# -------- Stage 1: Build --------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps (needed for native modules like bufferutil during npm ci)
RUN apk add --no-cache python3 make g++

# Install all dependencies (including devDependencies for build)
COPY package*.json ./
# Same fix as runner stage: strip Replit-internal resolved URLs before npm ci
RUN sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json && \
    npm ci --registry=https://registry.npmjs.org

# Copy source code
COPY . .

# Build: Vite (frontend) + esbuild (backend → dist/index.cjs)
RUN npm run build


# -------- Stage 2: Production --------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install only production + skip optional native modules (bufferutil, etc.)
COPY package*.json ./
# Replit's internal npm proxy rewrites resolved URLs in package-lock.json to
# package-firewall.replit.local — an address that only exists inside Replit.
# Strip those so npm ci fetches from the public registry instead.
RUN sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json && \
    npm ci --omit=dev --omit=optional --registry=https://registry.npmjs.org && \
    npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Copy migrations (used by startup migration logic)
COPY --from=builder /app/migrations ./migrations

# Run as non-root for security (k8s best practice)
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# Expose port
EXPOSE 5000

# Healthcheck for Kubernetes liveness/readiness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/ || exit 1

# Start app
CMD ["node", "dist/index.cjs"]
