# Worker de la Fase 6. Construir desde la raíz del repositorio:  docker build -f worker/Dockerfile -t tcontrol-worker worker
FROM node:20-alpine
ENV TZ=America/Guayaquil NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
CMD ["node", "src/index.js"]
