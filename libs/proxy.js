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
const asrProvider = require('./asrProvider');
const floodMonitor = require('./floodMonitor');
const AWS = require('aws-sdk');

module.exports = {
    initialize: async function(cloudProvider){
        utils.cleanupTemporaryDirectory(config.stale_uploads_timeout);
        await routetable.initialize();
        await tasktable.initialize();

        setInterval(() => {
            utils.cleanupTemporaryDirectory(config.stale_uploads_timeout);
        }, 1000 * 60 * 30);

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

        const maxConcurrencyLimitReached = async (maxConcurrentTasks, token) => {
            if (!maxConcurrentTasks) return false;

            const userRoutes = await routetable.findByToken(token);
            let runningTasks = 0;
            await new Promise((resolve) => {
                async.each(Object.keys(userRoutes), (taskId, cb) => {
                    (userRoutes[taskId]).node.taskInfo(taskId).then((taskInfo) => {
                        if (taskInfo.status && [statusCodes.QUEUED, statusCodes.RUNNING].indexOf(taskInfo.status.code) !== -1) runningTasks++;
                        cb();
                    });
                }, resolve);
            });
            
            return runningTasks >= maxConcurrentTasks;
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
                    version: "1.5.3", // this is the version we speak
                    taskQueueCount: 0,
                    totalMemory: 99999999999, 
                    availableMemory: 99999999999,
                    cpuCores: 99999999999,
                    maxImages: limits.maxImages || null,
                    maxParallelTasks: limits.maxConcurrentTasks !== undefined ? limits.maxConcurrentTasks : 99999999999,
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
            // If the error is caused by a connection issue,
            // we actually simulate the same behavior by dropping the connection
            // because returning an error could make a NodeODM client assume that something failed
            if (res.socket && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')){
                logger.warn(`Proxy redirect error: ${err.message}`);
                res.socket.destroy();
            }else{
                json(res, {error: `Proxy redirect error: ${err.message}`});
            }
        });

        // Added for CORS support
        var enableCors = function(req, res) {
          if (req.headers['access-control-request-method']) {
              res.setHeader('access-control-allow-methods', req.headers['access-control-request-method']);
          }

          if (req.headers['access-control-request-headers']) {
              res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers']);
          }

          if (req.headers.origin) {
              res.setHeader('access-control-allow-origin', req.headers.origin);
              res.setHeader('access-control-allow-credentials', 'true');
          }
        };

        const requestListener = async function (req, res) {
            enableCors(req, res);

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

                        asrProvider.onCommit(taskId, 10 * 1000);

                        // Add reference to S3 path if necessary
                        if (asrProvider.downloadsPath()){
                            taskInfo.s3Path = asrProvider.downloadsPath();
                        }

                        const token = await routetable.lookupToken(taskId);
                        try{
                            cloudProvider.taskFinished(token, taskInfo);
                        }catch(e){
                            logger.error(`cloudProvider.taskFinished: ${e.message}`);
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
                    res.writeHead(401, "unauthorized");
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
                    let ctx = null;
                    try{
                        ctx = await taskNew.createContext(req, res);
                    }catch(e){
                        json(res, {error: e.message});
                        return;
                    }

                    const { uuid, tmpPath, die } = ctx;

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

                        if (await maxConcurrencyLimitReached(limits.maxConcurrentTasks, query.token)){
                            // TODO: A better solution would be to put the task in a queue
                            // but it's non-trivial to keep such a state, as well as to deal
                            // with scalability of storage requirements.
                            die(`Reached maximum number of concurrent tasks: ${limits.maxConcurrentTasks}. Please wait until other tasks have finished, then restart the task.`);
                            return;
                        }

                        // Validate options
                        try{
                            odmOptions.filterOptions(options, await getLimitedOptions(query.token, limits, referenceNode));
                        }catch(e){
                            die(e.message);
                            return;
                        }

                        floodMonitor.recordTaskInit(query.token);
                        
                        if (floodMonitor.isFlooding(query.token)){
                            die(`Uuh, slow down! It seems like you are sending a lot of tasks. Check that your connection is not dropping, or wait ${floodMonitor.FORGIVE_TIME} minutes and try again.`);
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
                    // Destroy sockets after 30s of inactivity
                    req.setTimeout(30000, () => {
                        req.destroy();
                    });

                    const taskId = taskNew.getTaskIdFromPath(pathname);
                    if (taskId){
                        const saveFilesToDir = path.join('tmp', taskId);
                        async.series([
                            cb => {
                                fs.exists(saveFilesToDir, exists => {
                                    if (!exists) cb(new Error("Invalid taskId: the task no longer exists."));
                                    else cb();
                                });
                            },
                            cb => {
                                if (limits && limits.maxImages){
                                    // Check if we've exceeding image limits
                                    fs.readdir(saveFilesToDir, (err, files) => {
                                        if (err){
                                            logger.warn(`Failed to read files from ${saveFilesToDir}`);
                                            cb();
                                        }else if (files.length - 1 > limits.maxImages){
                                            // -1 accounts for _body.json
                                            cb(new Error("Max images count exceeded."));
                                        }else{
                                            cb();
                                        }
                                    });
                                }else{
                                    // No limits
                                    cb();
                                }
                            },
                            cb => {
                                taskNew.formDataParser(req, function(params){
                                    if (!params.imagesCount) cb(new Error("No files uploaded."));
                                    else if (params.error) cb(new Error(params.error));
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
                            asrProvider.cleanup(taskId);
                        };

                        if (await maxConcurrencyLimitReached(limits.maxConcurrentTasks, query.token)){
                            die(`Reached maximum number of concurrent tasks: ${limits.maxConcurrentTasks}. Please wait until other tasks have finished, then restart the task.`);
                            return;
                        }

                        floodMonitor.recordTaskCommit(query.token);
                        utils.markTaskAsCommitted(taskId);

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
                    let ctx = null;
                    try{
                        ctx = await taskNew.createContext(req, res);
                    }catch(e){
                        json(res, {error: e.message});
                        return;
                    }

                    const { uuid, tmpPath, die } = ctx;

                    taskNew.formDataParser(req, async function(params) {
                        if (params.error){
                            die(params.error);
                            return;
                        }

                        if (await maxConcurrencyLimitReached(limits.maxConcurrentTasks, query.token)){
                            die(`Reached maximum number of concurrent tasks: ${limits.maxConcurrentTasks}. Please wait until other tasks have finished, then restart the task.`);
                            return;
                        }

                        try{
                            await taskNew.process(req, res, cloudProvider, uuid, params, query.token, limits, getLimitedOptions);
                        }catch(e){
                            die(e.message);
                            return;
                        }
                    }, { saveFilesToDir: tmpPath, limits });
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
                                            await tasktable.add(taskId, taskTableEntry, query.token);
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
                }else if (req.method === 'GET' && pathname === '/task/list') {
                    const taskIds = {};
                    const taskTableEntries = await tasktable.findByToken(query.token);
                    for (let taskId in taskTableEntries){
                        taskIds[taskId] = true;
                    }

                    const routeTableEntries = await routetable.findByToken(query.token, true);
                    for (let taskId in routeTableEntries){
                        taskIds[taskId] = true;
                    }
                    
                    json(res, Object.keys(taskIds).map(uuid => { return { uuid } }));
                }else{
                    // Lookup task id
                    const matches = pathname.match(/^\/task\/([\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+)\/(.+)$/);
                    if (matches && matches[1]){
                        const taskId = matches[1];
                        const action = matches[2];

                        // Special case for /task/<uuid>/download/<asset> if 
                        // we need to redirect to S3. In that case, we rewrite
                        // the URL to fetch from S3.
                        if (asrProvider.downloadsPath() && action.indexOf('download') === 0){
                            const assetsMatch = action.match(/^download\/(.+)$/);
                            if (assetsMatch && assetsMatch[1]){
                                let assetPath = assetsMatch[1];

                                // Special case for orthophoto.tif
                                if (assetPath === 'orthophoto.tif') assetPath = 'odm_orthophoto/odm_orthophoto.tif';

                                const s3Url = url.parse(asrProvider.downloadsPath());
                                s3Url.pathname = path.join(taskId, assetPath);

                                const s3Config = asrProvider.get().getConfig("s3");

                                // If URL requires authentication, fetch the object on their behalf and then stream it to them
                                // If our aws library gets updated to v3, then we could return a redirect to a presigned url instead 
                                if (s3Config && s3Config.acl !== undefined && s3Config.acl !== "public-read") {
                                    let key = path.join(taskId, assetPath)

                                    const s3 = new AWS.S3({
                                        endpoint: new AWS.Endpoint(s3Config.endpoint),
                                        signatureVersion: 'v4',
                                        accessKeyId: asrProvider.get().getConfig("accessKey"),
                                        secretAccessKey: asrProvider.get().getConfig("secretKey")
                                    });

                                    s3.getObject({ Bucket: s3Config.bucket, Key: key }, (err, data) => {
                                        if (err) {
                                          logger.error(`Error encountered downloading object ${err}`);
                                          res.statusCode = 500;
                                          res.end('Internal server error');
                                          return;
                                        }

                                        // Set the content-type and content-length headers
                                        res.setHeader('Content-Type', data.ContentType);
                                        res.setHeader('Content-Length', data.ContentLength);

                                        // Write the object data to the response
                                        res.write(data.Body);
                                        res.end();
                                    });
                                    return;

                                } else {
                                    res.writeHead(301, {
                                        'Location': url.format(s3Url)
                                    });
                                    res.end();
                                    return;
                                }
                            }
                        }

                        const node = await routetable.lookupNode(taskId);

                        if (node){
                            overrideRequest(req, node, query, pathname);
                            proxy.web(req, res, { target: node.proxyTargetUrl() });
                        }else{
                            const taskTableEntry = await tasktable.lookup(taskId);
                            if (taskTableEntry){

                                // GET: /task/<uuid>/info
                                if (action === 'info'){
                                    let response = taskTableEntry.taskInfo;

                                    // ?with_output support
                                    if (query.with_output !== undefined){
                                        const line = parseInt(query.with_output) || 0;
                                        const output = taskTableEntry.output || [];
                                        response.output = output.slice(line, output.length);
                                    }

                                    // Populate processingTime if needed
                                    if (response.processingTime === undefined){
                                        response = utils.clone(response);
                                        if (response.dateCreated && response.status && response.status.code === statusCodes.RUNNING){
                                            response.processingTime = (new Date().getTime()) - response.dateCreated;
                                        }else{
                                            response.processingTime = -1;
                                        }
                                    }

                                    json(res, response);

                                // GET: /task/<uuid>/output
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