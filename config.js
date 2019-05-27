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
'use strict';

const fs = require('fs');

// Read configuration from file
let defaultConfigFilePath = "config-default.json";
let defaultConfig = {};
try{
    let data = fs.readFileSync(defaultConfigFilePath);
    defaultConfig = JSON.parse(data.toString());
    defaultConfig.config = defaultConfigFilePath;
}catch(e){
    console.warn(`config-default.json not found or invalid: ${e.message}`);
    process.exit(1);
}

let argDefs = {
    string: ['port', 'admin-cli-port', 'admin-pass', 'admin-web-port',
            'cloud-provider', 'downloads-from-s3', 'log-level',
            'upload-max-speed', 'ssl-key', 'ssl-cert', 'secure-port',
            'cluster-address', 'config'],
    boolean: ['no-cluster', 'debug'],
    alias: {
        p: 'port',
        c: 'cloud-provider'
    },
    default: defaultConfig,

    int: ['port', 'admin-cli-port', 'admin-web-port', 'secure-port', 'upload-max-speed'] // for cast only, not used by minimist
};
let argv = require('minimist')(process.argv.slice(2), argDefs);

if (argv.help){
	console.log(`
Usage: node index.js [options]

Options:
    --config <path>	Path to JSON configuration file. You can use a configuration file instead of passing command line parameters. (default: config-default.json)
    -p, --port <number>	Port to bind the server to (default: 3000)
    --secure-port <number>	If SSL is enabled and you want to expose both a secure and non-secure service, set this value to the secure port. Otherwise only SSL will be enabled using the --port value. (default: none)
    --admin-cli-port <number> 	Port to bind the admin CLI to. Set to zero to disable. (default: 8080)
    --admin-web-port <number> 	Port to bind the admin web interface to. Set to zero to disable. (default: 10000)
    --admin-pass <string> 	Password to log-in to the admin functions (default: none)
    --log-level <logLevel>	Set log level verbosity (default: info)
    -c, --cloud-provider	Cloud provider to use (default: local)
    --upload-max-speed <number>	Upload to processing nodes speed limit in bytes / second (default: no limit)
    --downloads-from-s3 <URL>	S3 URL prefix where to redirect /task/<uuid>/download requests. (default: do not use S3, forward download requests to nodes) 
    --no-cluster	By default the program will set itself as being a cluster node for all split/merge tasks. Setting this option disables it. (default: false)
    --cluster-address <http(s)://host:port>	Should be set to a public URL that worker nodes can use to reach ClusterODM for the purpose of allowing split/merge workflows. (default: match the "host" header from client's HTTP request)
    --debug 	Disable caches and other settings to facilitate debug (default: false)
    --ssl-key <file>	Path to .pem SSL key file
    --ssl-cert <file>	Path to SSL .pem certificate
Log Levels: 
error | debug | info | verbose | debug | silly 
`);
	process.exit(0);
}

let userConfig = {};
if (argv.config !== defaultConfigFilePath){
    try{
        userConfig = JSON.parse(fs.readFileSync(argv.config).toString());
    }catch(e){
        console.warn(`${argv.config} not found or invalid: ${e.message}`);
        process.exit(1);
    }
}

function readConfig(key, cast = String){
    if (userConfig[key] !== undefined) return cast(userConfig[key]);
    else if (argv[key] !== undefined) return cast(argv[key]);
    else return '';
}

let config = {};

// Logging configuration
config.logger = {};
config.logger.level = readConfig('log-level'); // What level to log at; info, verbose or debug are most useful. Levels are (npm defaults): silly, debug, verbose, info, warn, error.
config.logger.maxFileSize = 1024 * 1024 * 100; // Max file size in bytes of each log file; default 100MB
config.logger.maxFiles = 10; // Max number of log files kept
config.logger.logDirectory = '' // Set this to a full path to a directory - if not set logs will be written to the application directory.

for (let k in argv){
    if (k === '_' || k.length === 1) continue;
    let ck = k.replace(/-/g, "_");
    let cast = String;
    if (argDefs.int.indexOf(k) !== -1) cast = parseInt;
    if (argDefs.boolean.indexOf(k) !== -1) cast = Boolean;
    config[ck] = readConfig(k, cast);
}

config.use_ssl = config.ssl_key && config.ssl_cert;
module.exports = config;
