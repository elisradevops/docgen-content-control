FROM node:18 as build
WORKDIR /usr/src/app
COPY . ./
RUN npm ci
RUN npm install typescript -g
RUN npm run build

# --------------BUILD END------------------

FROM  node:18
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY --from=build /usr/src/app/bin /usr/src/app
EXPOSE 3000

CMD ["node","index.js"]
