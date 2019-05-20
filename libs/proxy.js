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
"use strict";
const HttpProxy = require('http-proxy');
const http = require('http');
const https = require('https');
const path = require('path');
const url = require('url');
const Busboy = require('busboy');
const fs = require('fs');
const nodes = require('./nodes');
const ValueCache = require('./classes/ValueCache');
const config = require('../config');
const utils = require('./utils');
const routetable = require('./routetable');
const tasktable = require('./tasktable');
const logger = require('./logger');
const statusCodes = require('./statusCodes');
const taskNew = require('./taskNew');
const async = require('async');
const odmOptions = require('./odmOptions');

module.exports = {
	initialize: async function(cloudProvider){
        utils.cleanupTemporaryDirectory();
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
        const json = utils.json;

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
                    version: "1.5.1", // this is the version we speak
                    taskQueueCount: 0,
                    totalMemory: 99999999999, 
                    availableMemory: 99999999999,
                    cpuCores: 99999999999,
                    maxImages: limits.maxImages || null,
                    maxParallelTasks: 99999999999,
                    engineVersion: node !== undefined ? node.getInfo().engineVersion : '?',
                    engine: node !== undefined ? node.getInfo().engine : '?'
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

        const requestListener = async function (req, res) {
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

                if (pathname === '/auth/info'){
                    cloudProvider.handleAuthInfo(req, res);
                    return;
                }

                // Validate user token
                const { valid, limits } = await cloudProvider.validate(query.token);
                if (!valid || query._debugUnauthorized){
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

                if (req.method === 'POST' && pathname === '/task/new/init'){
                    const { uuid, tmpPath, die } = taskNew.createContext(req, res);

                    taskNew.formDataParser(req, async function(params){
                        const { options } = params;
                        if (params.error){
                            die(params.error);
                            return;
                        }

                        const referenceNode = nodes.referenceNode();
                        if (!referenceNode){
                            die("Cannot create task, no nodes are online.");
                            return;
                        }

                        // Validate options
                        try{
                            odmOptions.filterOptions(options, await getLimitedOptions(query.token, limits, referenceNode));
                        }catch(e){
                            die(e.message);
                            return;
                        }

                        // Save
                        fs.writeFile(path.join(tmpPath, "body.json"),
                                    JSON.stringify(params), {encoding: 'utf8'}, err => {
                            if (err) json(res, { error: err });
                            else{
                                // All good
                                json(res, { uuid });
                            }
                        });
                    });
                }else if (req.method === 'POST' && pathname.indexOf('/task/new/upload') === 0){
                    const taskId = taskNew.getTaskIdFromPath(pathname);
                    if (taskId){
                        const saveFilesToDir = path.join('tmp', taskId);
                        async.series([
                            cb => {
                                fs.exists(saveFilesToDir, exists => {
                                    if (!exists) cb(new Error("Invalid taskId (dir not found)"));
                                    else cb();
                                });
                            },
                            cb => {
                                taskNew.formDataParser(req, async function(params){
                                    if (!params.imagesCount) cb(new Error("No files uploaded."));
                                    else cb();
                                }, { saveFilesToDir, parseFields: false});
                            }
                        ], err => {
                            if (err) json(res, {error: err.message});
                            else json(res, {success: true});
                        });
                    }else json(res, { error: `No uuid found in ${pathname}`});
                }else if (req.method === 'POST' && pathname.indexOf('/task/new/commit') === 0){
                    const taskId = taskNew.getTaskIdFromPath(pathname);
                    if (taskId){
                        const tmpPath = path.join('tmp', taskId);
                        const bodyFile = path.join(tmpPath, 'body.json');
                        const die = (err) => {
                            utils.rmdir(tmpPath);
                            utils.json(res, {error: err});
                        };

                        async.series([
                            cb => {
                                fs.readFile(bodyFile, 'utf8', (err, data) => {
                                    if (err) cb(err);
                                    else{
                                        try{
                                            const body = JSON.parse(data);
                                            cb(null, body);
                                        }catch(e){
                                            cb(new Error(`Cannot commit task ${e.message}`));
                                        }
                                    }
                                });
                            },

                            cb => {
                                fs.readdir(tmpPath, (err, files) => {
                                    if (err) cb(err);
                                    else cb(null, files.filter(f => f.toLowerCase() !== "body.json"));
                                });
                            }
                        ], async (err, [ body, files ]) => {
                            if (err) json(res, {error: err.message});
                            else{
                                body.fileNames = files;
                                body.imagesCount = files.length;

                                try{
                                    await taskNew.process(req, res, cloudProvider, taskId, body, query.token, limits, getLimitedOptions);
                                }catch(e){
                                    die(e.message);
                                    return;
                                }
                            }
                        });
                    }else json(res, { error: `No uuid found in ${pathname}`});
                }else if (req.method === 'POST' && pathname === '/task/new') {
                    const { uuid, tmpPath, die } = taskNew.createContext(req, res);

                    taskNew.formDataParser(req, async function(params) {
                        if (params.error){
                            die(params.error);
                            return;
                        }

                        try{
                            await taskNew.process(req, res, cloudProvider, uuid, params, query.token, limits, getLimitedOptions);
                        }catch(e){
                            die(e.message);
                            return;
                        }
                    }, { saveFilesToDir: tmpPath });
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
                                            taskTableEntry.taskInfo.status.code = statusCodes.CANCELED;
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
                            if (taskTableEntry){
                                if (action === 'info'){
                                    json(res, taskTableEntry.taskInfo);
                                }else if (action === 'output'){
                                    const line = query.line || 0;
                                    const output = taskTableEntry.output || [];
                                    json(res, output.slice(line, output.length));
                                }else{
                                    json(res, { error: `Invalid route for taskId ${taskId}:${action}, no valid route possible.`});
                                }
                            }else{
                                json(res, { error: `Invalid route for taskId ${taskId}:${action}, no task table entry.`});
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
        };

        const servers = [{
            server: http.createServer(requestListener),
            secure: false
        }];

        if (config.use_ssl){
            servers.push({
                server: https.createServer({
                    key: fs.readFileSync(config.ssl_key, 'utf8'),
                    cert: fs.readFileSync(config.ssl_cert, 'utf8')
                }, requestListener),
                secure: true
            });
        }

        return servers;
    }
};