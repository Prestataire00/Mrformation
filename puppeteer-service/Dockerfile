# Image PDF sidecar pour MR/C3V Formation (Puppeteer + Chromium).
# Déployée sur Railway. Build automatique au push GitHub.
FROM node:20-slim

# Dépendances Chromium (libs partagées + polices + locales)
# Cf https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (puppeteer auto-télécharge Chromium au postinstall)
COPY package.json package-lock.json* ./
ENV PUPPETEER_SKIP_DOWNLOAD=false
# CRITICAL : on force un cache dir partagé entre build (root) et runtime (app).
# Sans ça, Chromium est téléchargé dans /root/.cache/puppeteer/ mais l'utilisateur
# `app` (runtime, voir plus bas) cherche dans /home/app/.cache/puppeteer/ → introuvable.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npm install --omit=dev

# Code source + build TS
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript@5.6.3 \
    && npx tsc \
    && npm prune --omit=dev

# Sécurité : utilisateur non-root
RUN groupadd -r app && useradd -r -g app -G audio,video app \
    && mkdir -p /home/app/Downloads \
    && chown -R app:app /home/app \
    && chown -R app:app /app
USER app

EXPOSE 8080
CMD ["node", "dist/server.js"]
