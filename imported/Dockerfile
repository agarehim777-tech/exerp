FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# VITE_ values are compiled into the browser bundle. Do not pass secrets here.
ARG VITE_APP_NAME="ERP+CRM AZ"
ARG VITE_APP_ENV="production"
ARG VITE_API_BASE_URL=""
ARG VITE_DB_PROVIDER="postgres"
ARG VITE_AUDIT_MODE="immutable"
ARG VITE_BACKUP_ENABLED="true"
ARG VITE_WEBHOOKS_ENABLED="true"
ARG VITE_RELEASE_VERSION="1.0.0"
ENV VITE_APP_NAME=$VITE_APP_NAME \
  VITE_APP_ENV=$VITE_APP_ENV \
  VITE_API_BASE_URL=$VITE_API_BASE_URL \
  VITE_DB_PROVIDER=$VITE_DB_PROVIDER \
  VITE_AUDIT_MODE=$VITE_AUDIT_MODE \
  VITE_BACKUP_ENABLED=$VITE_BACKUP_ENABLED \
  VITE_WEBHOOKS_ENABLED=$VITE_WEBHOOKS_ENABLED \
  VITE_RELEASE_VERSION=$VITE_RELEASE_VERSION
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
