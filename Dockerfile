# clipvoice: one image with the built PWA and the API that serves it.

# 1. Install everything and build the web app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build

# 2. Runtime: server dependencies only, plus the built PWA.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/server && npm cache clean --force
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist

# The server looks for the PWA at ../web/dist, relative to its own folder.
WORKDIR /app/apps/server
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "src/index.js"]
