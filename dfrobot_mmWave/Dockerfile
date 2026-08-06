ARG BUILD_FROM=ghcr.io/hassio-addons/base:19.0.0

FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV NODE_ENV=production \
    PORT=42069 \
    FRONTEND_DIST=/app/frontend/dist

WORKDIR /app

# --------------------------------------------------
# Node.js runtime
# --------------------------------------------------

RUN apk add --no-cache \
    nodejs \
    npm


# --------------------------------------------------
# Install backend production dependencies only
# --------------------------------------------------

COPY package.json package-lock.json ./

COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci \
    --omit=dev \
    --workspace=backend \
    --include-workspace-root=false \
    --no-audit \
    --no-fund \
    && npm cache clean --force


# --------------------------------------------------
# Copy precompiled application
#
# backend/dist and frontend/dist are generated
# BEFORE docker build by GitHub Actions
# --------------------------------------------------

COPY backend/dist ./backend/dist
COPY frontend/dist ./frontend/dist


# --------------------------------------------------
# Home Assistant App files
# --------------------------------------------------

COPY config.yaml ./config.yaml
COPY config/device ./config/device
COPY rootfs/ /


# --------------------------------------------------
# Permissions
# --------------------------------------------------

RUN chmod +x \
    /etc/s6-overlay/s6-rc.d/mmwave-web-ui/run


# --------------------------------------------------
# Metadata
# --------------------------------------------------

LABEL \
    org.opencontainers.image.title="DFRobot mmWave" \
    org.opencontainers.image.description="DFRobot mmWave Home Assistant App" \
    org.opencontainers.image.source="https://github.com/jiaziui/mmWave_addons"


EXPOSE 42069/tcp
