FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
RUN npm ci
COPY src ./src
COPY public ./public

ARG VITE_API_BASE=/api
ARG VITE_APP_BASE=/app/
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_APP_BASE=${VITE_APP_BASE}

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker.nginx.conf /etc/nginx/conf.d/default.conf
