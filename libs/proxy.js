"use strict";
const HttpProxy = require('http-proxy');
const http = require('http');
const url = require('url');
const Busboy = require('busboy');
const fs = require('fs');
const package_info = require('../package_info');
const nodes = require('./nodes');
const odmOptions = require('./odmOptions');

module.exports = {
	initialize: function(cloudProvider){
        // Allow .css and .js files to be retrieved from nodes
        // without authentication
        const publicPath = (path) => {
            for (let ext of [".css", ".js", ".woff", ".ttf"]){
                if (path.substr(-ext.length) === ext){
                    return true;
                }
            }
            return false;
        };

        const json = (res, json) => {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(json));
        };

        const proxy = new HttpProxy();

        const pathHandlers = {
            '/info': function(req, res, user){
                const { limits } = user;
                const node = nodes.referenceNode();

                json(res, {
                    version: package_info.version,
                    taskQueueCount: 0,
                    totalMemory: 99999999999, 
                    availableMemory: 99999999999,
                    cpuCores: 99999999999,
                    maxImages: limits.maxImages || -1,
                    maxParallelTasks: 99999999999,
                    odmVersion: node !== undefined ? node.getInfo().odmVersion : '?' 
                }); 
            },

            '/options': function(req, res, user){
                const { token, limits } = user;
                json(res, []);
                return;

                const node = nodes.referenceNode();
                if (!node) json(res, {'error': 'Cannot compute /options, no nodes are online.'});
                else{
                    return odmOptions.applyLimits(nodes.getOptions())
                }
            }
        }

        // TODO: https support
    
        return http.createServer(async function (req, res) {
            const target = "http://localhost:3002";

            const urlParts = url.parse(req.url, true);
            const { query, pathname } = urlParts;

            if (publicPath(pathname)){
                proxy.web(req, res, { target });
                return;
            }

            // Validate user token
            const { valid, limits } = await cloudProvider.validate(query.token);
            if (!valid){
                json(res, {error: "Invalid authentication token"});
                return;
            }

            if (pathHandlers[pathname]){
                (pathHandlers[pathname])(req, res, { token: query.token, limits });
                return;
            } 

            // TODO: Swap token if necessary
            // if (query.token){
            //     query.token = "test"; // Example override of token string
            // }

            req.url = url.format({ query, pathname });
            
            // if (req.url.indexOf("new") !== -1){
            //     console.log(req.url, req.body);
            // }

            if (req.method === 'POST') {
                const bodyWfs = fs.createWriteStream('myBinaryFile');

                req.pipe(bodyWfs).on('finish', () => {
                    const bodyRfs = fs.createReadStream('myBinaryFile');

                    const busboy = new Busboy({ headers: req.headers });
                    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                        console.log('File [' + fieldname + ']: filename: ' + filename);
                        file.resume();
                    });
                    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                        console.log('Field [' + fieldname + ']: value: ' + val);
                    });
                    busboy.on('finish', function() {
                        console.log('Done parsing form!');
                        proxy.web(req, res, { target, buffer: fs.createReadStream('myBinaryFile') });
                    });

                    bodyRfs.pipe(busboy);
                });
            }else{
                proxy.web(req, res, { target });
            }
        });
    }
};