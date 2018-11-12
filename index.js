const config = require('./config');
const admincli = require('./admincli');
const logger = require('./libs/logger');
const package_info = require('./package_info');
const nodes = require('./libs/nodes');
const proxy = require('./libs/proxy');

(async function(){
    logger.info(package_info.name + " " + package_info.version);
    admincli.create({port: config.admin_cli_port, password: config.admin_cli_pass});
    const cloudProvider = (require('./libs/cloudProvider')).initialize(config.cloud_provider);

    const proxyServer = proxy.initialize(cloudProvider);

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