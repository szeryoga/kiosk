FROM node:22-alpine AS build

WORKDIR /app

COPY package.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
RUN npm install
COPY src ./src

ARG VITE_API_BASE=/api
ARG VITE_ADMIN_BASE=/admin/
ARG VITE_PAGINATION_MAX_LINES=20
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_ADMIN_BASE=${VITE_ADMIN_BASE}
ENV VITE_PAGINATION_MAX_LINES=${VITE_PAGINATION_MAX_LINES}

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker.nginx.conf /etc/nginx/conf.d/default.conf
