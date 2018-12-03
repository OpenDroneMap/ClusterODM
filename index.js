/**
 *  nodeodm-proxy - A reverse proxy, load balancer and task tracker for NodeODM
 *  Copyright (C) 2018-present MasseranoLabs LLC
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const config = require('./config');
const admincli = require('./admincli');
const logger = require('./libs/logger');
const package_info = require('./package_info');
const nodes = require('./libs/nodes');
const proxy = require('./libs/proxy');
const routetable = require('./libs/routetable');
const tasktable = require('./libs/tasktable');

(async function(){
    if (config.debug) logger.warn("Running in debug mode");
    logger.info(package_info.name + " " + package_info.version);
    admincli.create({port: config.admin_cli_port, password: config.admin_cli_pass});
    const cloudProvider = (require('./libs/cloudProvider')).initialize(config.cloud_provider);
    await nodes.initialize();

    const proxyServer = await proxy.initialize(cloudProvider);

    const gracefulShutdown = async() => {
        await nodes.cleanup();
        await routetable.cleanup();
        
        logger.info("Bye!");
        process.exit(0);
    };

    // listen for TERM signal .e.g. kill
    process.on('SIGTERM', gracefulShutdown);

    // listen for INT signal e.g. Ctrl-C
    process.on('SIGINT', gracefulShutdown);

    // Start
    logger.info(`Starting proxy on ${config.port}`);
    proxyServer.listen(config.port);
})();