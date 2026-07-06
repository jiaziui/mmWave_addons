ARG BUILD_FROM=ghcr.io/hassio-addons/base:19.0.0

FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=development

COPY package.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm install

COPY backend backend
COPY frontend frontend
RUN npm run build --workspaces

FROM ${BUILD_FROM} AS addon
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV NODE_ENV=production \
    PORT=42069 \
    FRONTEND_DIST=/app/frontend/dist
WORKDIR /app

RUN apk add --no-cache nodejs npm

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/dist /app/frontend/dist
COPY config.yaml /app/config.yaml
COPY rootfs/ /

RUN chmod +x /etc/s6-overlay/s6-rc.d/mmwave-web-ui/run

EXPOSE 42069/tcp

FROM addon AS final
