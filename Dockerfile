# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS app

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN cd agent \
  && npm ci \
  && npm run build

RUN cd front \
  && npm ci --include=optional \
  && npm --workspace @devscope/api run build \
  && npm run build

FROM app AS front

WORKDIR /app/front

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://langcore:langcore_password@postgres:5432/langcore
ENV RAG_API_URL=http://rag-api:4000
ENV DEVSCOPE_API_URL=http://rag-api:4000
ENV NEXT_PUBLIC_RAG_API_URL=http://localhost:4000

EXPOSE 3000

CMD ["sh", "-lc", "npm run db:migrate && npm run start"]

FROM app AS rag-api

WORKDIR /app/front

ENV HOST=0.0.0.0
ENV PORT=4000
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://langcore:langcore_password@postgres:5432/langcore
ENV TRANSFORMERS_REMOTE_HOST=https://hf-mirror.com

EXPOSE 4000

CMD ["npm", "--workspace", "@devscope/api", "run", "start"]
