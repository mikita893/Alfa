FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 ALFA_DB=/app/data/alfa.sqlite
WORKDIR /app
COPY --chown=node:node package.json package-lock.json server.js auth.js manage-users.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
