FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Use relative /api/v1 and /health paths.
# Do not embed the backend's public URL in React.
ENV VITE_API_BASE_URL=""

RUN npm run build

#server
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_FILTER="^BACKEND_ORIGIN$"

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]