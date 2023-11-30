# Install dependencies
FROM arm64v8/node:20-alpine AS builder
WORKDIR /app

COPY package*.json /app
RUN npm ci && npm cache clean --force
COPY ./nuxt3-project /app

RUN npm run build

# Create prod
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS prod
WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /app/.output /app/.output
COPY --from=builder --chown=nonroot:nonroot /app/server/api/AmazonRootCA1.pem /app/server/api/AmazonRootCA1.pem
USER nonroot
EXPOSE 3000
CMD ["/app/.output/server/index.mjs"]