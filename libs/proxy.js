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
"use strict";
const HttpProxy = require('http-proxy');
const http = require('http');
const url = require('url');
const Busboy = require('busboy');
const fs = require('fs');
const package_info = require('../package_info');
const nodes = require('./nodes');
const odmOptions = require('./odmOptions');
const ValueCache = require('./classes/ValueCache');
const config = require('../config');
const utils = require('./utils');
const routetable = require('./routetable');
const logger = require('./logger');

module.exports = {
	initialize: async function(cloudProvider){
        utils.cleanupTemporaryDirectory(true);
        await routetable.initialize();

        // Allow index, .css and .js files to be retrieved from nodes
        // without authentication
        const publicPath = (path) => {
            if (path === '/') return true;

            for (let ext of [".css", ".js", ".woff", ".ttf"]){
                if (path.substr(-ext.length) === ext){
                    return true;
                }
            }
            return false;
        };

        // JSON helper for responses
        const json = (res, json) => {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(json));
        };

        // Replace token 
        const overrideRequest = (req, node, query, pathname) => {
            if (query.token && node.getToken()){
                // Override token. When requests come in through
                // the proxy, the token is the user's token
                // but when we redirect them to a node
                // the token is specific to the node.
                query.token = node.getToken(); 
            }

            req.url = url.format({ query, pathname });
        };

        const proxy = new HttpProxy();
        const optionsCache = new ValueCache({expires: 60 * 60 * 1000});

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

            '/options': async function(req, res, user){
                const { token, limits } = user;
                const cacheValue = optionsCache.get(token);
                if (cacheValue){
                    json(res, cacheValue);
                    return;
                }

                const node = nodes.referenceNode();
                if (!node) json(res, {'error': 'Cannot compute /options, no nodes are online.'});
                else{
                    const options = await node.getOptions();
                    const limitedOptions = odmOptions.optionsWithLimits(options, limits.options);
                    json(res, optionsCache.set(token, limitedOptions));
                }
            }
        }

        // Intercept response and add routing table entry
        proxy.on('proxyRes', (proxyRes, req, res) => {
            const { pathname } = url.parse(req.url, true);

            if (pathname === '/task/new'){
                let body = new Buffer('');
                proxyRes.on('data', function (data) {
                    body = Buffer.concat([body, data]);
                });
                proxyRes.on('end', function () {
                    try{
                        body = JSON.parse(body.toString());
                    }catch(e){
                        json(res, {error: `Cannot parse response: ${body.toString()}`});
                        return;
                    }
                    
                    if (body.uuid){
                        routetable.add(body.uuid, req.node);
                    }
                    
                    // return original response
                    res.end(JSON.stringify(body));
                });
            }
        });

        // Listen for the `error` event on `proxy`.
        proxy.on('error', function (err, req, res) {
            json(res, {error: `Proxy redirect error: ${err.message}`});
        });

        // TODO: https support
    
        return http.createServer(async function (req, res) {
            const urlParts = url.parse(req.url, true);
            const { query, pathname } = urlParts;

            if (publicPath(pathname)){
                const referenceNode = nodes.referenceNode();
                if (referenceNode){
                    proxy.web(req, res, { target: referenceNode.proxyTargetUrl() });
                }else{
                    json(res, {error: "No nodes available"});
                }

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
            
            if (req.method === 'POST' && pathname === '/task/new') {
                const tmpFile = utils.temporaryFilePath();
                const bodyWfs = fs.createWriteStream(tmpFile);

                req.pipe(bodyWfs).on('finish', () => {
                    const bodyRfs = fs.createReadStream(tmpFile);
                    let imagesCount = 0;

                    const busboy = new Busboy({ headers: req.headers });
                    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                        imagesCount++;
                        file.resume();
                    });
                    // busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                    //     console.log('Field [' + fieldname + ']: value: ' + val);
                    // });
                    busboy.on('finish', async function() {
                        const node = await nodes.findBestAvailableNode(imagesCount, true);
                        if (node){
                            overrideRequest(req, node, query, pathname);
                            const stream = fs.createReadStream(tmpFile);
                            stream.on('end', () => {
                                // Cleanup
                                fs.unlink(tmpFile, err => {
                                    if (err) logger.warn(`Cannot delete ${tmpFile}: ${err}`);
                                });
                            });

                            // TODO: add error handler for all proxy.web requests
                            req.node = node;
                            proxy.web(req, res, {
                                target: node.proxyTargetUrl(),
                                buffer: stream,
                                selfHandleResponse: true
                            });
                            // }, errHandler);
                        }else{
                            json(res, { error: "No nodes available"});
                        }
                    });

                    bodyRfs.pipe(busboy);
                });
            }else{
                // Lookup task id
                const matches = pathname.match(/^\/task\/([\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+)\/.+$/);
                if (matches && matches[1]){
                    const taskId = matches[1];
                    let node = await routetable.lookup(taskId);
                    if (node){
                        overrideRequest(req, node, query, pathname);
                        proxy.web(req, res, { target: node.proxyTargetUrl() });
                    }else{
                        json(res, { error: `Invalid route for taskId ${taskId}, no nodes in routing table.`});
                    }
                }else{
                    json(res, { error: `Cannot handle ${pathname}`});
                }
            }
        });
    }
};