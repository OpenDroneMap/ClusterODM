# syntax=docker/dockerfile:1
ARG NODE_VERSION=14

FROM node:${NODE_VERSION}-slim as build

WORKDIR /workspace

COPY package*.json .
RUN --mount=type=cache,target=/root/.npm \
    npm clean-install

COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build

FROM node:${NODE_VERSION}-slim
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root

RUN --mount=type=cache,target=/var/cache/apt \
    apt update && \
    apt install -y \
      telnet \
      curl 

WORKDIR /tmp
RUN base=https://gitlab-docker-machine-downloads.s3.amazonaws.com/main && \
    curl -L $base/docker-machine-$(uname -s)-$(uname -m) >/tmp/docker-machine && \
    install /tmp/docker-machine /usr/local/bin/docker-machine
ADD https://github.com/scaleway/docker-machine-driver-scaleway/releases/download/v1.6/docker-machine-driver-scaleway_1.6_linux_amd64.tar.gz /tmp/docker-machine-driver-scaleway.tar.gz
RUN tar -xzf /tmp/docker-machine-driver-scaleway.tar.gz --directory=/tmp && \
    install --mode +x /tmp/docker-machine-driver-scaleway /usr/local/bin/
ADD https://github.com/JonasProgrammer/docker-machine-driver-hetzner/releases/download/2.0.1/docker-machine-driver-hetzner_2.0.1_linux_amd64.tar.gz /tmp/docker-machine-driver-hetzner.tar.gz
RUN tar -xzf /tmp/docker-machine-driver-hetzner.tar.gz --directory=/tmp && \
    install --mode +x /tmp/docker-machine-driver-hetzner /usr/local/bin/ 

RUN rm -r /tmp/*

USER node

WORKDIR "/var/www"

RUN mkdir "/var/www/data" && mkdir "/var/www/tmp"

COPY package*.json .
RUN npm clean-install --production

COPY --from=build /workspace/build/ /var/www/

VOLUME ["/var/www/data"]
VOLUME ["/var/www/tmp"]
ENTRYPOINT ["/usr/local/bin/node", "/var/www/index.js"]
