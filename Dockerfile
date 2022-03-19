FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json /app/
RUN npm ci
 
FROM node:14.15-alpine
ENV NODE_ENV production
USER node
WORKDIR /app
COPY --chown=node:node --from=build /app/node_modules /app/node_modules
COPY --chown=node:node . /app

ENTRYPOINT [ "node", "/app/bos" ]