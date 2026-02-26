FROM node:18 AS build
WORKDIR /usr/src/app
COPY package*.json ./
# Harden npm install against transient network resets in CI/buildx (arm64/QEMU).
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && npm ci
COPY . ./
RUN npm run build
RUN npm prune --omit=dev

# --------------BUILD END------------------

FROM node:18
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/bin /usr/src/app
EXPOSE 3000

CMD ["node","index.js"]
