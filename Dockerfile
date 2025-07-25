FROM node:20-bullseye

# Install system dependencies required for pdf processing and puppeteer
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libatk-bridge2.0-0t64 libatk1.0-0t64 libgtk-3-0t64 \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    xdg-utils libasound2t64 libpango-1.0-0 libpangocairo-1.0-0 libxss1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable && yarn install --production
COPY . .
RUN yarn build

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/main"]
