FROM node:18-alpine

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ iputils espeak

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3032

ENV NODE_ENV=production
ENV PORT=3032

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3032/api/health || exit 1

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

CMD ["node", "server.js"]
