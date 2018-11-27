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
const path = require('path');
const url = require('url');
const Busboy = require('busboy');
const sizeOf = require('buffer-image-size');
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
        const publicPath = (p) => {
            for (let ext of [".css", ".js", ".woff", ".ttf"]){
                if (p.substr(-ext.length) === ext){
                    return true;
                }
            }
            return false;
        };

        // Paths that are forwarded as-is, without additional logic
        // (but require authentication)
        const directPath = (p) => {
            if (p === '/') return true;

            return false;
        };

        // JSON helper for responses
        const json = (res, json) => {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(json));
        };

        const forwardToReferenceNode = (req, res) => {
            const referenceNode = nodes.referenceNode();
            if (referenceNode){
                proxy.web(req, res, { target: referenceNode.proxyTargetUrl() });
            }else{
                json(res, {error: "No nodes available"});
            }
        };

        const getLimitedOptions = async (token, limits, node) => {
            const cacheValue = optionsCache.get(token);
            if (cacheValue) return cacheValue;

            const options = await node.getOptions();
            const limitedOptions = odmOptions.optionsWithLimits(options, limits.options);
            return optionsCache.set(token, limitedOptions);
        };

        const getReqBody = async (req) => {
            return new Promise((resolve, reject) => {
                let body = [];
                req.on('data', (chunk) => {
                    body.push(chunk);
                }).on('end', () => {
                    resolve(Buffer.concat(body).toString());
                });
            });
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
                    maxImages: limits.maxImages || null,
                    maxParallelTasks: 99999999999,
                    odmVersion: node !== undefined ? node.getInfo().odmVersion : '?' 
                });
            },

            '/options': async function(req, res, user){
                const { token, limits } = user;
                const node = nodes.referenceNode();
                if (!node) json(res, {'error': 'Cannot compute /options, no nodes are online.'});
                else{
                    const options = await getLimitedOptions(token, limits, node);
                    json(res, options);
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
                        routetable.add(body.uuid, req.node, req.token);
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
            try{
                const urlParts = url.parse(req.url, true);
                const { query, pathname } = urlParts;

                if (publicPath(pathname)){
                    forwardToReferenceNode(req, res);
                    return;
                }

                if (req.method === 'POST' && pathname === '/commit'){
                    const body = await getReqBody(req);
                    try{
                        const taskInfo = JSON.parse(body);
                        const taskId = taskInfo.uuid;
                        const token = await routetable.lookupToken(taskId);
                        if (token){
                            try{
                                cloudProvider.taskFinished(token, taskInfo);
                            }catch(e){
                                logger.error(`cloudProvider.taskFinished: ${e.message}`);
                            }
                        }else{
                            // Something is not right, notify an admin
                            // as we cannot record this transaction
                            logger.error(`Cannot record transaction, token is missing: ${taskInfo}`);
                        }

                        json(res, {ok: true});
                    }catch(e){
                        logger.warn(`Malformed /commit request: ${body}`);
                        json(res, {error: "Malformed /commit request"});
                    }

                    return;
                }

                // Validate user token
                const { valid, limits } = await cloudProvider.validate(query.token);
                if (!valid){
                    json(res, {error: "Invalid authentication token"});
                    return;
                }

                if (directPath(pathname)){
                    forwardToReferenceNode(req, res);
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
                        let options = null;
                        let uploadError = null;
                        let imageSizeSamples = [];

                        const busboy = new Busboy({ headers: req.headers });
                        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                            // Sample somewhat randomly, always at least one sample, skip .txt files
                            if ((imageSizeSamples.length === 0 || utils.randomIntFromInterval(0, imagesCount) === 0) && filename.toLowerCase().indexOf(".txt") === -1){
                                let chunks = [];
                                file.on('data', chunk => chunks.push(chunk));
                                file.on('end', () => {
                                    try{
                                        const dims = sizeOf(Buffer.concat(chunks));
                                        if (dims.width > 16 && dims.height > 16){
                                            imageSizeSamples.push(dims);
                                        }
                                    }catch(e){
                                        // Do nothing, invalid file
                                    }
                                });
                            }else{
                                file.resume();
                            }
                            
                            imagesCount++;
                        });
                        busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                            // Save options
                            if (fieldname === 'options'){
                                options = val;
                            }

                            else if (fieldname === 'zipurl' && val){
                                uploadError = "File upload via URL is not available. Sorry :(";
                            }
                        });
                        busboy.on('finish', async function() {
                            const die = (err) => {
                                cleanup();
                                json(res, {error: err});
                            };

                            const cleanup = () => {
                                fs.unlink(tmpFile, err => {
                                    if (err) logger.warn(`Cannot delete ${tmpFile}: ${err}`);
                                });
                            };

                            if (uploadError){
                                die(uploadError);
                                return;
                            }

                            if (imageSizeSamples.length === 0){
                                die("Not enough images. Please upload at least 2 images.");
                                return;
                            }

                            // Estimate image sizes
                            const IMAGE_SAMPLES = 3;
                            const imageSizeSamplesSubset = imageSizeSamples.slice(-IMAGE_SAMPLES);
                            const imageSizesEstimate = imageSizeSamplesSubset.reduce((acc, dims) => {
                                acc.width += dims.width;
                                acc.height += dims.height;
                                return acc;
                            }, { width: 0, height: 0 });
                            imageSizesEstimate.width /= imageSizeSamplesSubset.length;
                            imageSizesEstimate.height /= imageSizeSamplesSubset.length;

                            // Check with provider if we're allowed to process these many images
                            // at this resolution
                            const { approved, error } = await cloudProvider.approveNewTask(query.token, imagesCount, imageSizesEstimate);
                            if (!approved){
                                die(error);
                                return;
                            }

                            const node = await nodes.findBestAvailableNode(imagesCount, true);
                            if (node){
                                // Validate options
                                try{
                                    odmOptions.filterOptions(options, await getLimitedOptions(query.token, limits, node));
                                }catch(e){
                                    die(e.message);
                                    return;
                                }

                                overrideRequest(req, node, query, pathname);
                                const stream = fs.createReadStream(tmpFile);
                                stream.on('end', cleanup);

                                req.node = node;
                                req.token = query.token;
                                proxy.web(req, res, {
                                    target: node.proxyTargetUrl(),
                                    buffer: stream,
                                    selfHandleResponse: true
                                });
                            }else{
                                json(res, { error: "No nodes available"});
                            }
                        });

                        bodyRfs.pipe(busboy);
                    });
                }else if (req.method === 'POST' && ['/task/restart', '/task/cancel', '/task/remove'].indexOf(pathname) !== -1){
                    // Lookup task id from body
                    let taskId = null;
                    let body = await getReqBody(req);

                    const busboy = new Busboy({ headers: req.headers });
                    busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                        if (fieldname === 'uuid'){
                            taskId = val;
                        }
                    });
                    busboy.on('finish', async function() {
                        if (taskId){
                            let node = await routetable.lookupNode(taskId);
                            if (node){
                                overrideRequest(req, node, query, pathname);
                                proxy.web(req, res, { 
                                        target: node.proxyTargetUrl(),
                                        buffer: utils.stringToStream(body)
                                    });
                            }else{
                                json(res, { error: `Invalid route for taskId ${taskId}, no nodes in routing table.`});
                            }
                        }else{
                            json(res, { error: `No uuid found in ${pathname}`});
                        }
                    });

                    utils.stringToStream(body).pipe(busboy);
                }else{
                    // Lookup task id
                    const matches = pathname.match(/^\/task\/([\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+)\/(.+)$/);
                    if (matches && matches[1]){
                        const taskId = matches[1];
                        const action = matches[2];

                        // Special case for /task/<uuid>/download/<asset> if 
                        // we need to redirect to S3. In that case, we rewrite
                        // the URL to fetch from S3.
                        if (config.downloads_from_s3 && action.indexOf('download') === 0){
                            const assetsMatch = action.match(/^download\/(.+)$/);
                            if (assetsMatch && assetsMatch[1]){
                                const s3Url = url.parse(config.downloads_from_s3);
                                s3Url.pathname = path.join(taskId, assetsMatch[1]);
                                res.writeHead(301, {
                                    'Location': url.format(s3Url)
                                });
                                res.end();
                                return;
                            }
                        }

                        let node = await routetable.lookupNode(taskId);
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
            }catch(e){
                logger.warn(`Uncaught exception: ${e}`);
                json(res, { error: 'exception'});
                if (config.debug) throw e;
            }
        });
    }
};