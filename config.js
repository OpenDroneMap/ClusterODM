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
'use strict';

let fs = require('fs');
let argv = require('minimist')(process.argv.slice(2), {
    string: ['port', 'admin-cli-port', 'admin-cli-pass', 'cloud-provider', 'downloads-from-s3', 'log-level'],
    boolean: ['debug'],
    alias: {
        p: 'port',
        c: 'cloud-provider'
    },
    default: {
        'port': 3000,
        'admin-cli-port': 8080,
        'admin-cli-pass': '',
        'cloud-provider': 'local',
        'downloads-from-s3': '',
        'debug': false,
        'log-level': 'info'
    }
});

if (argv.help){
	console.log(`
Usage: node index.js [options]

Options:
    -p, --port <number> 	Port to bind the server to (default: 3000)
    --admin-cli-port <number> 	Port to bind the admin CLI to (default: 8080)
    --admin-cli-pass <string> 	Password to log-in to the admin CLI (default: none)
    --log-level <logLevel>	Set log level verbosity (default: info)
    -c, --cloud-provider	Cloud provider to use (default: local)
    --downloads-from-s3 <URL>	S3 URL prefix where to redirect /task/<uuid>/download requests. (default: do not use S3, forward download requests to nodes) 
    --debug 	Disable caches and other settings to facilitate debug (default: false)
Log Levels: 
error | debug | info | verbose | debug | silly 
`);
	process.exit(0);
}
let config = {};

// Logging configuration
config.logger = {};
config.logger.level = argv['log-level'] || 'info'; // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
config.logger.maxFileSize = 1024 * 1024 * 100; // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = 10; // Max number of log files kept
config.logger.logDirectory = '' // Set this to a full path to a directory - if not set logs will be written to the application directory.

config.port = parseInt(argv.port);
config.admin_cli_port = parseInt(argv['admin-cli-port']);
config.admin_cli_pass = argv['admin-cli-pass'];
config.cloud_provider = argv['cloud-provider'];
config.debug = argv['debug'];
config.downloads_from_s3 = argv['downloads-from-s3'];

module.exports = config;
