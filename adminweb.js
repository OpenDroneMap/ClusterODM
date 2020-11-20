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
const package_info = require('./package_info');

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


        // TODO: UI (let's work on improving this soon!)

        const htmlHead = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>ClusterODM</title>
            <link rel="stylesheet" href="/pure-min.css">
            <style type="text/css">
            body{
                text-align: center;
            }
            table{
                margin-left: auto;
                margin-right: auto;
                min-width: 360px;
                text-align: left;
                margin-bottom: 2em;
            }
            .offline{
                color: red;
            }
            </style>
        </head>
        <body>`;
        
        const htmlFoot = `</body>
        </html>`;

        app.get('/', (req, res) => {
            res.send(`${htmlHead}
<h1>ClusterODM ${package_info.version}</h1>
<table class="pure-table pure-table-bordered">
    <thead>
            <tr>
                <th>#</th>
                <th>Node</th>
                <th>Status</th>
                <th>Queue</th>
                <th>Engine</th>
                <th>API</th>
                <th>Flags</th>
            <tr>
    </thead>
    <tbody>
        ${nodes.all().map((node, idx) => {
            const flags = [];
            if (node.isLocked()) flags.push("L");
            if (node.isAutoSpawned()) flags.push("A");

            return `<tr>
                <td>${idx + 1}</td>
                <td>${node}</td>
                <td>${node.isOnline() ? "Online" : "<span class='offline'>Offline</span>"}</td>
                <td>${node.getTaskQueueCount()}/${node.getMaxParallelTasks()}</td>
                <td>${node.getEngineInfo()}</td>
                <td>${node.getVersion()}</td>
                <td>${flags.join(",")}</td>
            </tr>`;
        }).join("")}
    </tbody>
</table>
<script>
var field = 'autorefresh';
var url = window.location.href;
if(url.indexOf('?' + field + '=') != -1 || url.indexOf('&' + field + '=') != -1){
    setTimeout(function(){
        location.reload(true);
    }, 5000);
    document.write("<input type='button' value='Disable Auto Refresh' onclick=\\"location.href='/'\\">");
}else{
    document.write("<input type='button' value='Enable Auto Refresh' onclick=\\"location.href='/?autorefresh=1'\\">");
}
</script>
            ${htmlFoot}`);
        });
        
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

