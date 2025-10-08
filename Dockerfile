# syntax=docker/dockerfile:1.7

FROM node:20-bullseye AS base
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

FROM base AS deps
COPY package.json yarn.lock ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY . .
RUN yarn build

FROM node:20-bullseye AS production

# Install system dependencies required for pdf processing and headless Chromium
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    poppler-utils \
    curl \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate \
    && yarn install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY --from=build /app/init.sh ./init.sh

EXPOSE 8080
CMD ["node", "dist/main"]
