# syntax=docker/dockerfile:1.7

FROM node:20-bullseye AS base
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install 

FROM deps AS build
COPY . .
RUN yarn build

FROM node:20-bullseye AS production

RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable && corepack prepare yarn@1.22.22 --activate \
    && yarn install \
    && yarn cache clean

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/main"]
