# One public website: dashboard + YOLO API in a single container.
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg libglib2.0-0 libgomp1 libgl1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
RUN pip install --no-cache-dir -r /app/ml/requirements.txt

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV ML_API_URL=http://127.0.0.1:8765
ENV OPS_API_URL=http://127.0.0.1:8766
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV PORT=47281
EXPOSE 47281
CMD ["node", "scripts/serve.cjs"]
