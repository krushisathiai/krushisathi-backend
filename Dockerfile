# Production Dockerfile for Krushi Sathi AI Backend
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose backend PORT
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["node", "server.js"]
