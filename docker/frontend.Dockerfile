# syntax=docker/dockerfile:1.7
#
# MediAssist AI -- frontend (React 19 + Vite 8, served as static files)
#
# Build context is the project root (doctor_Assistant/). Nothing under
# frontend/ is modified: the image runs the project's own `npm run build` and
# serves the dist/ it produces.

# ---------------------------------------------------------------------------
# Stage 1 -- build
# ---------------------------------------------------------------------------
# node:22-alpine matches the toolchain the project is developed on (v22.12)
# and satisfies Vite 8's engine requirement (^20.19 || >=22.12).
FROM node:22-alpine AS build

WORKDIR /app/frontend

# Manifest first, so a source-only change reuses the install layer.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# Vite inlines import.meta.env at build time, so the API address has to be
# known here rather than at container start. It is the address the *browser*
# reaches the backend on -- the published host port, not the compose service
# name, which no browser can resolve. compose.yaml passes it through.
ARG VITE_API_BASE_URL=http://localhost:5000/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 -- serve
# ---------------------------------------------------------------------------
# The unprivileged nginx image: runs as uid 101 with no root step, and listens
# on 8080 rather than needing a privileged port.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
