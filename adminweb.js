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
const cors = require('cors')

module.exports = {
    create: function(options) {
        logger.info("Starting admin web interface on " + options.port);

        const app = express();
        app.use(cors())

        if (!options.password) {
            logger.warn(`No admin password specified, make sure port ${options.port} is secured`);
        } else {
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
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-BmbxuPwQa2lc/FVzBcNJ7UAyJxM6wuqIj61tLrc4wSX0szH/Ev+nYRRuWlolflfl" crossorigin="anonymous">
          <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta2/dist/js/bootstrap.bundle.min.js" integrity="sha384-b5kHyXgcpbZJO/tY9Ul7kGkf1S0CWuKcCD38l8YkeH8z8QjE0GmW1gYU5S9FOnJ0" crossorigin="anonymous"></script>
        </head>
        <body>`;

        const htmlFoot = `
        </body>
        </html>`;

        app.get('/', (req, res) => {
            res.send(`${htmlHead}
              <div class="container">
                <h1>ClusterODM ${package_info.version}</h1>
                <table class="table table-hover table-striped">
                  <thead>
                    <tr class="text-white bg-primary">
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
                      <td>${node.isOnline() ? '<span class="badge bg-success">Online</span>' : '<span class="badge badge-danger">Offline</span>'}</td>
                      <td>${node.getTaskQueueCount()}/${node.getMaxParallelTasks()}</td>
                      <td>${node.getEngineInfo()}</td>
                      <td>${node.getVersion()}</td>
                      <td>${flags.join(",")}</td>
                      </tr>`;
                    }).join("")}
                  </tbody>
                </table>
                
                <div id="btn-refresh" class="text-end"></div>
              </div>
              <script>
                let field = 'autorefresh';
                let url = window.location.href;

                if (url.indexOf('?' + field + '=') != -1 || url.indexOf('&' + field + '=') != -1) {
                  setTimeout(function() {
                    location.reload(true);
                  }, 5000);

                  let button = document.createElement('button')
                  button.classList.add('btn', 'btn-danger')
                  button.innerHTML = "Disable Auto Refresh"
                  button.onclick = function() {
                    location.href='/'
                  }
                  
                  document.getElementById('btn-refresh').appendChild(button)
                } else {
                  let button = document.createElement('button')
                  button.classList.add('btn', 'btn-success')
                  button.innerHTML = "Enable Auto Refresh"
                  button.onclick = function() {
                    location.href='/?autorefresh=1'
                  }

                  document.getElementById('btn-refresh').appendChild(button)
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
            } else {
                res.send({error: "Invalid"});
            }
        });

        app.listen(options.port);
    }
}