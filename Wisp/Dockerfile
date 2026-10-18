FROM node:22-bookworm-slim AS web-build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

COPY apps/web ./apps/web
COPY vite.config.ts tsconfig.json ./
RUN npm run build


FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/apps/api \
    WISP_ENVIRONMENT=cloud

COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY apps/api ./apps/api
COPY deploy ./deploy
COPY --from=web-build /src/dist ./dist

CMD ["sh", "-c", "exec uvicorn deploy.cloud_entrypoint:app --host 0.0.0.0 --port ${PORT:-8080}"]
