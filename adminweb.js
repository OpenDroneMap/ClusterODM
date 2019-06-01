/**
 *  ClusterODM - A reverse proxy, load balancer and task tracker for NodeODM
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
const logger = require('./libs/logger');
const express = require('express');
const basicAuth = require('express-basic-auth');
const nodes = require('./libs/nodes');

module.exports = {
    create: function(options){
        logger.info("Starting admin web interface on " + options.port);
        const app = express();

        if (!options.password){
            logger.warn(`No admin password specified, make sure port ${options.port} is secured`);
        }else{
            app.use(basicAuth({
                users: { 'admin': options.password },
                challenge: true,
                realm: "ClusterODM"
            }));
        }
        
        app.use(express.static('public'));
        app.use(express.json());

        // API
        app.post('/r/node/add', (req, res) => {
            const { hostname, port, token } = req.body;
            const node = nodes.addUnique(hostname, port, token);
            if (node) {
                node.updateInfo();
                res.send({success: true});
            }else{
                res.send({error: "Invalid"});
            }
        });

        app.listen(options.port);
    }
}

