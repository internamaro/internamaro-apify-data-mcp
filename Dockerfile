# Stdio MCP server. Build: docker build -t internamaro-apify-data-mcp .
# Run:   docker run -i --rm -e APIFY_TOKEN=<your own token> internamaro-apify-data-mcp
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npm test && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/src ./dist/src
USER node
# APIFY_TOKEN is read at call time; the server starts and lists its tools without it.
ENTRYPOINT ["node", "dist/src/index.js"]
