# Build stage: install all deps (incl. native build toolchain) so better-sqlite3 and argon2 compile.
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite-dev
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node build.mjs

# Runtime stage: drop the build toolchain, run as non-root.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ sqlite-dev \
 && npm ci --omit=dev \
 && apk del python3 make g++ \
 && npm cache clean --force
COPY --from=build /app/server.mjs ./
COPY --from=build /app/app.mjs ./
COPY --from=build /app/build.mjs ./
COPY --from=build /app/db.mjs ./
COPY --from=build /app/auth.mjs ./
COPY --from=build /app/schemas.mjs ./
COPY --from=build /app/config.mjs ./
COPY --from=build /app/routes ./routes
# node:alpine already ships a `node` user with uid/gid 1000, so reuse it instead of
# creating a new one (the previous RUN collided with that pre-existing user).
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
