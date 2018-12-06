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
const sizeOf = require('image-size');
const fs = require('fs');
const package_info = require('../package_info');
const nodes = require('./nodes');
const odmOptions = require('./odmOptions');
const ValueCache = require('./classes/ValueCache');
const config = require('../config');
const utils = require('./utils');
const routetable = require('./routetable');
const tasktable = require('./tasktable');
const logger = require('./logger');
const Curl = require('node-libcurl').Curl;

module.exports = {
	initialize: async function(cloudProvider){
        utils.cleanupTemporaryDirectory(true);
        await routetable.initialize();
        await tasktable.initialize();

        setInterval(() => {
            utils.cleanupTemporaryDirectory();
        }, 1000 * 60 * 60 * 4);

        // Allow index, .css and .js files to be retrieved from nodes
        // without authentication
        const publicPath = (p) => {
            for (let ext of [".css", ".js", ".woff", ".ttf", ".ico"]){
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
            if (node.getToken()){
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

                        // Add reference to S3 path if necessary
                        if (config.downloads_from_s3){
                            taskInfo.s3Path = config.downloads_from_s3;
                        }

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
                            logger.error(`Cannot record transaction, token is missing: ${JSON.stringify(taskInfo)}`);
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
                    // json(res, {error: "Invalid authentication token"});
                    res.writeHead(401, "unauthorized")
                    res.end();
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
                    let imagesCount = 0;
                    let options = null;
                    let taskName = "";
                    let uploadError = null;
                    let uuid = utils.uuidv4(); // TODO: add support for set-uuid header parameter
                    let tmpPath = path.join('tmp', uuid);
                    let fileNames = [];

                    if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);

                    const busboy = new Busboy({ headers: req.headers });
                    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                        const name = path.basename(filename);
                        fileNames.push(name);

                        const saveTo = path.join(tmpPath, name);
                        file.pipe(fs.createWriteStream(saveTo));
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

                        else if (fieldname === 'name' && val){
                            taskName = val;
                        }
                    });
                    busboy.on('finish', async function() {
                        const die = (err) => {
                            utils.rmdir(tmpPath);
                            json(res, {error: err});
                        };

                        if (uploadError){
                            die(uploadError);
                            return;
                        }

                        // Estimate image sizes
                        const IMAGE_TARGET_SAMPLES = 3;
                        let imageDimensions = {width: 0, height: 0},
                            imgSamplesCount = 0;
                        
                        if (fileNames.length < 2){
                            die(`Not enough images (${fileNames.length} files uploaded)`);
                            return;
                        }

                        utils.shuffleArray(fileNames);

                        for (let i = 0; i < fileNames.length; i++){
                            const fileName = fileNames[i];
                            const filePath = path.join(tmpPath, fileName);

                            // Skip .txt files
                            if (/.txt$/i.test(filePath)) continue;

                            const dims = sizeOf(filePath);
                            if (dims.width > 16 && dims.height > 16){
                                imageDimensions.width += dims.width;
                                imageDimensions.height += dims.height;
                                if (++imgSamplesCount === IMAGE_TARGET_SAMPLES) break;
                            }
                        }

                        if (imgSamplesCount === 0){
                            die(`Not enough images. You need at least 2 images.`);
                            return;
                        }

                        imageDimensions.width /= imgSamplesCount;
                        imageDimensions.height /= imgSamplesCount;

                        // Check with provider if we're allowed to process these many images
                        // at this resolution
                        const { approved, error } = await cloudProvider.approveNewTask(query.token, imagesCount, imageDimensions);
                        if (!approved){
                            die(error);
                            return;
                        }

                        const node = await nodes.findBestAvailableNode(imagesCount, true);
                        if (node){
                            // Validate options
                            let taskOptions;
                            try{
                                taskOptions = odmOptions.filterOptions(options, await getLimitedOptions(query.token, limits, node));
                            }catch(e){
                                die(e.message);
                                return;
                            }

                            const taskInfo = {
                                uuid,
                                name: taskName || "Unnamed Task",
                                dateCreated: (new Date()).getTime(),
                                processingTime: -1,
                                status: {code: 20},
                                options: taskOptions,
                                imagesCount: imagesCount
                            };

                            // Start forwarding the task to the node
                            // (using CURL, because NodeJS libraries are buggy)
                            const curl = new Curl(),
                                  close = curl.close.bind(curl);

                            const multiPartBody = fileNames.map(f => { return { name: 'images', file: path.join(tmpPath, f) } });
                            multiPartBody.push({
                                name: 'name',
                                contents: taskName
                            });
                            multiPartBody.push({
                                name: 'options',
                                contents: JSON.stringify(taskOptions)
                            });

                            const curlErrorHandler = async err => {
                                const taskInfo = (await tasktable.lookup(uuid)).taskInfo;
                                if (taskInfo){
                                    taskInfo.status.code = 30; // Failed
                                    await tasktable.add(uuid, { taskInfo });
                                    logger.warn(`Cannot forward task ${uuid} to processing node ${node}: ${err.message}`);
                                }
                                utils.rmdir(tmpPath);
                                close();
                            };

                            curl.setOpt(Curl.option.URL, `${node.proxyTargetUrl()}/task/new?token=${node.getToken()}`);
                            curl.setOpt(Curl.option.HTTPPOST, multiPartBody);
                            curl.setOpt(Curl.option.HTTPHEADER, [
                                'Content-Type: multipart/form-data',
                                `set-uuid: ${uuid}`
                            ]);

                            curl.on('end', async function (statusCode, body, headers){
                                if (statusCode === 200){
                                    try{
                                        body = JSON.parse(body);
                                        if (body.error) throw new Error(body.error);
                                        if (body.uuid !== uuid) throw new Error(`set-uuid did not match, ${body.uuid} !== ${uuid}`);
                                    
                                        await routetable.add(uuid, node, query.token);
                                        await tasktable.delete(uuid);
                                    }catch(e){
                                        curlErrorHandler(e);
                                    }
                                }else{
                                    curlErrorHandler(new Error(`statusCode is ${statusCode}, expected 200`));
                                }
                            });
                            curl.on('error', curlErrorHandler);

                            await tasktable.add(uuid, { taskInfo, abort: close });

                            // Send back response to user
                            json(res, { uuid });

                            curl.perform();
                        }else{
                            json(res, { error: "No nodes available"});
                        }
                    });

                    req.pipe(busboy);
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
                                const taskTableEntry = await tasktable.lookup(taskId);
                                if (taskTableEntry && taskTableEntry.taskInfo){
                                    if (pathname === '/task/cancel' || pathname === '/task/remove'){
                                        if (taskTableEntry.abort){ 
                                            taskTableEntry.abort();
                                            taskTableEntry.abort = null;
                                            logger.info(`Task ${taskId} aborted via ${pathname}`);
                                        }
                                        
                                        utils.rmdir(`tmp/${taskId}`);

                                        if (pathname === '/task/remove'){
                                            await tasktable.delete(taskId);
                                        }

                                        if (pathname === '/task/cancel'){
                                            taskTableEntry.taskInfo.status.code = 50; // CANCELED TODO: bring status code enums from nodeodm
                                            await tasktable.add(taskId, taskTableEntry);
                                        }

                                        json(res, { success: true });
                                    }else{
                                        json(res, { error: `Action not supported. Please create a new task.` });
                                    }
                                }else{
                                    json(res, { error: `Invalid route for taskId ${taskId}, no nodes in routing table.`});
                                }
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
                                let assetPath = assetsMatch[1];

                                // Special case for orthophoto.tif
                                if (assetPath === 'orthophoto.tif') assetPath = 'odm_orthophoto/odm_orthophoto.tif';

                                const s3Url = url.parse(config.downloads_from_s3);
                                s3Url.pathname = path.join(taskId, assetPath);
                                res.writeHead(301, {
                                    'Location': url.format(s3Url)
                                });
                                res.end();
                                return;
                            }
                        }

                        const node = await routetable.lookupNode(taskId);

                        if (node){
                            overrideRequest(req, node, query, pathname);
                            proxy.web(req, res, { target: node.proxyTargetUrl() });
                        }else{
                            const taskTableEntry = await tasktable.lookup(taskId);
                            if (taskTableEntry && action === 'info'){
                                json(res, taskTableEntry.taskInfo);
                            }else{
                                json(res, { error: `Invalid route for taskId ${taskId}, no valid route possible.`});
                            }
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