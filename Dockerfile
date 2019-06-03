FROM node:lts
MAINTAINER Piero Toffanin <pt@masseranolabs.com>

EXPOSE 3000

USER root

RUN apt update && apt install -y telnet curl && \
    base=https://github.com/docker/machine/releases/download/v0.16.0 && \
    curl -L $base/docker-machine-$(uname -s)-$(uname -m) >/tmp/docker-machine && \
    install /tmp/docker-machine /usr/local/bin/docker-machine

COPY . /var/www
WORKDIR "/var/www"

RUN npm install

VOLUME ["/var/www/data"]
ENTRYPOINT ["/usr/local/bin/node", "/var/www/index.js"]
