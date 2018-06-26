const httpProxy = require('http-proxy');
const http = require('http');
const config = require('./config');
const admincli = require('./admincli');
const logger = require('./libs/logger');

admincli.create({port: config.admin_cli_port, password: config.admin_cli_pass});

const proxy = httpProxy.createProxyServer({
    target: {
      host: 'localhost',
      port: 3002
    }
  });

const  proxyServer = http.createServer(function (req, res) {
    proxy.web(req, res);
});
  
proxyServer.listen(config.port);