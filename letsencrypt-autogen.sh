#!/bin/bash
__dirname=$(cd $(dirname "$0"); pwd -P)
cd ${__dirname}

hash certbot 2>/dev/null || not_found=true 
if [ $not_found ]; then
	echo "Certbot not found. You need to install certbot to use this script."
	exit 1
fi

DOMAIN="${WO_HOST:=$1}"
if [ -z $DOMAIN ]; then
	echo "Usage: $0 <my.domain.com>"
	exit 1
fi

echo Stopping nodeodm-proxy services...
systemctl stop "nodeodm-proxy*"

# Generate/update certificate
certbot certonly --work-dir ./letsencrypt --config-dir ./letsencrypt --logs-dir ./letsencrypt --standalone -d $DOMAIN --register-unsafely-without-email --agree-tos --keep

if [ -e "letsencrypt/live/$DOMAIN" ]; then
	ln -vs "./letsencrypt/live/$DOMAIN/privkey.pem" key.pem
	ln -vs "./letsencrypt/live/$DOMAIN/fullchain.pem" cert.pem
else
	echo -e "\033[91mWARN: We couldn't automatically generate the SSL certificate. Review the console log. WebODM will likely be inaccessible.\033[39m"
fi

echo Starting nodeodm-proxy services...
systemctl start "nodeodm-proxy*"
