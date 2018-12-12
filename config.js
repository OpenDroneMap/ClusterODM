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
    string: ['port', 'admin-cli-port', 'admin-cli-pass', 
            'cloud-provider', 'downloads-from-s3', 'log-level',
            'upload-max-speed', 'ssl-key', 'ssl-cert', 'secure-port'],
    boolean: ['debug'],
    alias: {
        p: 'port',
        c: 'cloud-provider'
    },
    default: {
        'port': 3000,
        'secure-port': 0,
        'admin-cli-port': 8080,
        'admin-cli-pass': '',
        'cloud-provider': 'local',
        'downloads-from-s3': '',
        'debug': false,
        'log-level': 'info',
        'upload-max-speed': 0,
        'ssl-key': '',
        'ssl-cert': ''
    }
});

if (argv.help){
	console.log(`
Usage: node index.js [options]

Options:
    -p, --port <number> 	Port to bind the server to (default: 3000)
    --secure-port <number>	If SSL is enabled and you want to expose both a secure and non-secure service, set this value to the secure port. Otherwise only SSL will be enabled using the --port value. (default: none)
    --admin-cli-port <number> 	Port to bind the admin CLI to (default: 8080)
    --admin-cli-pass <string> 	Password to log-in to the admin CLI (default: none)
    --log-level <logLevel>	Set log level verbosity (default: info)
    -c, --cloud-provider	Cloud provider to use (default: local)
    --upload-max-speed <number>	Upload to processing nodes speed limit in bytes / second (default: no limit)
    --downloads-from-s3 <URL>	S3 URL prefix where to redirect /task/<uuid>/download requests. (default: do not use S3, forward download requests to nodes) 
    --debug 	Disable caches and other settings to facilitate debug (default: false)
    --ssl-key <file>	Path to .pem SSL key file
    --ssl-cert <file>	Path to SSL .pem certificate
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
config.secure_port = parseInt(argv['secure-port']);
config.admin_cli_port = parseInt(argv['admin-cli-port']);
config.admin_cli_pass = argv['admin-cli-pass'];
config.cloud_provider = argv['cloud-provider'];
config.debug = argv['debug'];
config.downloads_from_s3 = argv['downloads-from-s3'];
config.upload_max_speed = argv['upload-max-speed'];
config.ssl_key = argv['ssl-key'];
config.ssl_cert = argv['ssl-cert'];
config.use_ssl = config.ssl_key && config.ssl_cert;

module.exports = config;
