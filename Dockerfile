ARG NODE_IMG_TAG=22
FROM node:${NODE_IMG_TAG}-bookworm-slim AS base
ARG NODE_IMG_TAG
LABEL opendronemap.org.app-name="clusterodm" \
      opendronemap.org.node-img-tag="${NODE_IMG_TAG}" \
      opendronemap.org.maintainer="Piero Toffanin <pt@masseranolabs.com>" \
      opendronemap.org.api-port="3000"
RUN apt-get update --quiet \
    && DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --quiet --no-install-recommends \
        "ca-certificates" \
        "telnet" \
        "curl" \
        "dnsutils" \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates
WORKDIR "/var/www"
USER root


FROM base AS docker-machine
RUN base=https://gitlab-docker-machine-downloads.s3.amazonaws.com/main && \
    curl -L $base/docker-machine-$(uname -s)-$(uname -m) >/tmp/docker-machine && \
    install /tmp/docker-machine /usr/local/bin/docker-machine && \
    curl -L https://github.com/scaleway/docker-machine-driver-scaleway/releases/download/v1.6/docker-machine-driver-scaleway_1.6_linux_amd64.tar.gz | tar -xz --directory=/tmp && \
    install --mode +x /tmp/docker-machine-driver-scaleway /usr/local/bin/ && \
    curl -L https://github.com/JonasProgrammer/docker-machine-driver-hetzner/releases/download/2.0.1/docker-machine-driver-hetzner_2.0.1_linux_amd64.tar.gz | tar -xz --directory=/tmp && \
    install --mode +x /tmp/docker-machine-driver-hetzner /usr/local/bin/


FROM base AS build
RUN apt-get update --quiet \
    && DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --quiet --no-install-recommends \
        "git" \
    && rm -rf /var/lib/apt/lists/*
COPY package.json /var/www/
RUN npm install


FROM node:${NODE_IMG_TAG} AS runtime
COPY --chown=node:node --from=build /var/www/node_modules /var/www/node_modules
COPY --chown=node:node --from=docker-machine /usr/local/bin /usr/local/bin
COPY --chown=node:node . /var/www
RUN chown -R node:node /var/www


FROM scratch
COPY --from=runtime / /
WORKDIR "/var/www"
USER node
VOLUME ["/var/www/data"]
ENTRYPOINT ["/usr/local/bin/node", "/var/www/index.js"]
