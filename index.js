const httpProxy = require('http-proxy');
const http = require('http');
const config = require('./config');
const admincli = require('./admincli');
const logger = require('./libs/logger');
const package_info = require('./package_info');
const nodes = require('./libs/nodes');
const url = require('url');

(async function(){
    logger.info(package_info.name + " " + package_info.version);
    
    admincli.create({port: config.admin_cli_port, password: config.admin_cli_pass});
    
    const proxy = httpProxy.createProxyServer({
        target: {
          host: 'localhost',
          port: 3002
        }
      });
    
    const  proxyServer = http.createServer(function (req, res) {
        console.log(req.url);
    
        const urlParts = url.parse(req.url, true);
        const { query, pathname } = urlParts;
    
        if (query.token) query.token = "test";
    
        req.url = url.format({ query, pathname });
        console.log(req.url);
    
        proxy.web(req, res);
    });

    const gracefulShutdown = async() => {
        await nodes.cleanup();
        logger.info("Bye!");
        process.exit(0);
    };

    // listen for TERM signal .e.g. kill
    process.on('SIGTERM', gracefulShutdown);

    // listen for INT signal e.g. Ctrl-C
    process.on('SIGINT', gracefulShutdown);

    // Start
    await nodes.initialize();
    logger.info(`Starting proxy on ${config.port}`);
    proxyServer.listen(config.port);
})();