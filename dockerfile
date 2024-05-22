FROM node:slim as build
WORKDIR /usr/src/app
COPY . ./
RUN npm ci
RUN npm install typescript -g
RUN npm run build

# --------------BUILD END------------------

FROM  node:slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY --from=build /usr/src/app/bin /usr/src/app
EXPOSE 3000

CMD ["node","index.js"]
