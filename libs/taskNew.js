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
const Busboy = require('busboy');
const utils = require('./utils');
const netutils = require('./netutils');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const FormData = require('form-data');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const tasktable = require('./tasktable');
const routetable = require('./routetable');
const nodes = require('./nodes');
const odmOptions = require('./odmOptions');
const statusCodes = require('./statusCodes');
const asrProvider = require('./asrProvider');
const logger = require('./logger');
const events = require('events');

const assureUniqueFilename = (dstPath, filename) => {
    return new Promise((resolve, _) => {
        const dstFile = path.join(dstPath, filename);
        fs.exists(dstFile, async exists => {
            if (!exists) resolve(filename);
            else{
                const parts = filename.split(".");
                if (parts.length > 1){
                    resolve(await assureUniqueFilename(dstPath, 
                        `${parts.slice(0, parts.length - 1).join(".")}_.${parts[parts.length - 1]}`));
                }else{
                    // Filename without extension? Strange..
                    resolve(await assureUniqueFilename(dstPath, filename + "_"));
                }
            }
        });
    });
};

const getUuid = async (req) => {
    if (req.headers['set-uuid']){
        const userUuid = req.headers['set-uuid'];
        
        // Valid UUID and no other task with same UUID?
        console.log(userUuid);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userUuid)){
            if (await tasktable.lookup(userUuid)){
                throw new Error(`Invalid set-uuid: ${userUuid}`);
            }else if (await routetable.lookup(userUuid)){
                throw new Error(`Invalid set-uuid: ${userUuid}`);
            }else{
                return userUuid;
            }
        }else{
            throw new Error(`Invalid set-uuid: ${userUuid}`);
        }
    }

    return utils.uuidv4();
};

module.exports = {
    // @return {object} Context object with methods and variables to use during task/new operations 
    createContext: async function(req, res){
        let uuid = await getUuid(req);

        const tmpPath = path.join('tmp', uuid);

        if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);

        return {
            uuid, 
            tmpPath,
            die: (err) => {
                utils.rmdir(tmpPath);
                utils.json(res, {error: err});
                asrProvider.cleanup(uuid);
            }
        };
    },

    formDataParser: function(req, onFinish, options = {}){
        if (options.saveFilesToDir === undefined) options.saveFilesToDir = false;
        if (options.parseFields === undefined) options.parseFields = true;
        if (options.limits === undefined) options.limits = {};
        
        const busboy = new Busboy({ headers: req.headers });
        logger.debug(`Busboy created with headers: ${JSON.stringify(req.headers)}`);

        const params = {
            options: null,
            taskName: "",
            skipPostProcessing: false,
            outputs: null,
            dateCreated: null,
            error: null,
            webhook: "",
            fileNames: [],
            imagesCount: 0
        };

        if (options.parseFields){
            busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
                logger.debug(`Busboy field received: ${fieldname} = ${val}`);
                // Save options
                if (fieldname === 'options'){
                    params.options = val;
                }
    
                else if (fieldname === 'zipurl' && val){
                    params.error = "File upload via URL is not available. Sorry :(";
                }
    
                else if (fieldname === 'name' && val){
                    params.taskName = val;
                }
    
                else if (fieldname === 'skipPostProcessing' && val === 'true'){
                    params.skipPostProcessing = val;
                }

                else if (fieldname === 'outputs' && val){
                    params.outputs = val;
                }

                else if (fieldname === 'dateCreated' && !isNaN(parseInt(val))){
                    params.dateCreated = parseInt(val);
                }

                else if (fieldname === 'webhook' && val){
                    params.webhook = val;
                }
            });
        }
        if (options.saveFilesToDir){
            let pendingFiles = 0;
            let allFilesProcessed = false;
            
            const checkCompletion = () => {
                logger.debug(`Checking completion: pendingFiles=${pendingFiles}, allFilesProcessed=${allFilesProcessed}`);
                if (pendingFiles === 0 && allFilesProcessed) {
                    logger.debug(`All files completed, calling onFinish`);
                    onFinish(params);
                }
            };
            
            busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                logger.debug(`Busboy file received: fieldname=${fieldname}, filename=${filename}, encoding=${encoding}, mimetype=${mimetype}`);
                if (fieldname === 'images'){
                    if (options.limits.maxImages && params.imagesCount > options.limits.maxImages){
                        params.error = "Max images count exceeded.";
                        file.resume();
                        return;
                    }
                    
                    pendingFiles++;
                    logger.debug(`Pending files increased to: ${pendingFiles}`);
                    
                    filename = utils.sanitize(filename);
                    
                    // Special case
                    if (filename === 'body.json') filename = '_body.json';

                    // Use async handling for unique filename
                    assureUniqueFilename(options.saveFilesToDir, filename).then(uniqueFilename => {
                        logger.debug(`Unique filename resolved: ${uniqueFilename}`);
                        
                        const name = path.basename(uniqueFilename);
                        params.fileNames.push(name);
            
                        const saveTo = path.join(options.saveFilesToDir, name);
                        let saveStream = null;

                        // Detect if a connection is aborted/interrupted
                        // and cleanup any open streams to avoid fd leaks
                        const handleClose = () => {
                            if (saveStream){
                                saveStream.close();
                                saveStream = null;
                            }
                            fs.exists(saveTo, exists => {
                                if (exists){
                                    fs.unlink(saveTo, err => {
                                        if (err) logger.error(err);
                                    });
                                }
                            });
                        };
                        req.on('close', handleClose);
                        req.on('abort', handleClose);

                        saveStream = fs.createWriteStream(saveTo);
                        
                        saveStream.on('finish', () => {
                            logger.debug(`File stream finished for: ${uniqueFilename}`);
                            req.removeListener('close', handleClose);
                            req.removeListener('abort', handleClose);
                            saveStream = null;
                            params.imagesCount++;
                            pendingFiles--;
                            logger.debug(`File completed: ${uniqueFilename}, pendingFiles now: ${pendingFiles}`);
                            
                            if (options.limits.maxImages && params.imagesCount > options.limits.maxImages){
                                params.error = "Max images count exceeded.";
                            }
                            
                            checkCompletion();
                        });
                        
                        saveStream.on('error', (err) => {
                            logger.error(`File stream error for ${uniqueFilename}: ${err.message}`);
                            pendingFiles--;
                            params.error = `File save error: ${err.message}`;
                            checkCompletion();
                        });

                        file.pipe(saveStream);
                    }).catch(err => {
                        logger.error(`Error getting unique filename: ${err.message}`);
                        pendingFiles--;
                        params.error = `Filename error: ${err.message}`;
                        file.resume(); // Skip this file
                        checkCompletion();
                    });
                }
            });
            
            busboy.on('finish', function(){
                logger.debug(`Busboy finished parsing, setting allFilesProcessed=true`);
                allFilesProcessed = true;
                checkCompletion();
            });
        }
        
        busboy.on('error', function(err) {
            logger.error(`Busboy error: ${err.message}`);
        });
        
        if (!options.saveFilesToDir) {
            busboy.on('finish', function(){
                logger.debug(`Busboy finished parsing`);
                onFinish(params);
            });
        }
        
        req.on('close', function() {
            logger.debug(`Request connection closed`);
        });
        
        req.on('end', function() {
            logger.debug(`Request ended`);
            if (options.saveFilesToDir && !allFilesProcessed) {
                logger.debug(`Request ended but busboy finish not called, manually setting allFilesProcessed=true`);
                allFilesProcessed = true;
                checkCompletion();
            }
        });
        
        req.on('error', function(err) {
            logger.error(`Request error: ${err.message}`);
        });
        
        logger.debug(`Piping request to busboy`);
        req.pipe(busboy);
    },

    getTaskIdFromPath: function(pathname){
        const matches = pathname.match(/\/([\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+\-[\w\d]+)$/);

        if (matches && matches[1]){
            return matches[1];        
        }else return null;
    },

    augmentTaskOptions: function(req, taskOptions, limits, token){
        if (typeof taskOptions === "string") taskOptions = JSON.parse(taskOptions);
        if (!Array.isArray(taskOptions)) taskOptions = [];
        let odmOptions = [];

        if (config.splitmerge){
            // We automatically set the "sm-cluster" parameter
            // to match the address that was used to reach ClusterODM.
            // if "--split" is set.
            const clusterUrl = netutils.publicAddressPath('/', req, token);

            let foundSplit = false, foundSMCluster = false;
            taskOptions.forEach(to => {
                if (to.name === 'split'){
                    foundSplit = true;
                    odmOptions.push({name: to.name, value: to.value});
                }else if (to.name === 'sm-cluster'){
                    foundSMCluster = true;
                    odmOptions.push({name: to.name, value: clusterUrl});
                }else{
                    odmOptions.push({name: to.name, value: to.value});
                }
            });

            if (foundSplit && !foundSMCluster){
                odmOptions.push({name: 'sm-cluster', value: clusterUrl });
            }
        }else{
            // Make sure the "sm-cluster" parameter is removed
            odmOptions = utils.clone(taskOptions.filter(to => to.name !== 'sm-cluster'));
        }

        // Check limits
        if (limits.options){
            const limitOptions = limits.options;
            const assureOptions = {};

            for (let name in limitOptions){
                let lo = limitOptions[name];
                if (lo.assure && lo.value !== undefined) assureOptions[name] = {name, value: lo.value};
            }

            for (let i in odmOptions){
                let odmOption = odmOptions[i];

                if (limitOptions[odmOption.name] !== undefined){
                    let lo = limitOptions[odmOption.name];

                    if (assureOptions[odmOption.name]) delete(assureOptions[odmOption.name]);
        
                    // Modify value if between range rules command so
                    if (lo.between !== undefined){
                        if (lo.between.max_if_equal_to !== undefined && lo.between.max !== undefined &&
                            odmOption.value == lo.between.max_if_equal_to){
                            odmOption.value = lo.between.max;
                        }
                        if (lo.between.max !== undefined && lo.between.min !== undefined){
                            odmOption.value = Math.max(lo.between.min, Math.min(lo.between.max, odmOption.value));
                        }
                    }

                    // Handle booleans
                    if (lo.value === 'true'){
                        odmOption.value = true;
                    }
                }
            }

            for (let i in assureOptions){
                odmOptions.push(assureOptions[i]);
            }
        }

        return odmOptions;
    },

    process: async function(req, res, cloudProvider, uuid, params, token, limits, getLimitedOptions){
        const tmpPath = path.join("tmp", uuid);
        const { options, taskName, skipPostProcessing, outputs, dateCreated, fileNames, imagesCount, webhook } = params;

        if (fileNames.length < 1){
            throw new Error(`Not enough images (${fileNames.length} files uploaded)`);
        }

        // When --no-splitmerge is set, do not allow seed.zip
        if (!config.splitmerge){
            if (fileNames.indexOf("seed.zip") !== -1) throw new Error("Cannot use this node as a split-merge cluster.");
        }

        // Check with provider if we're allowed to process these many images
        // at this resolution
        const { approved, error } = await cloudProvider.approveNewTask(token, imagesCount);
        if (!approved) throw new Error(error);

        let node = await nodes.findBestAvailableNode(imagesCount, true);

        // Do we need to / can we create a new node via autoscaling?
        const autoscale = (!node || node.availableSlots() === 0) && 
                            asrProvider.isAllowedToCreateNewNodes() &&
                            asrProvider.canHandle(fileNames.length);

        if (autoscale) node = nodes.referenceNode(); // Use the reference node for task options purposes

        if (node){
            // Validate options
            // Will throw an exception on failure
            let taskOptions = odmOptions.filterOptions(this.augmentTaskOptions(req, options, limits, token), 
                                                        await getLimitedOptions(token, limits, node));

            const dateC = dateCreated !== null ? new Date(dateCreated) : new Date();
            const name = taskName || "Task of " + (dateC).toISOString();

            const taskInfo = {
                uuid,
                name,
                dateCreated: dateC.getTime(),
                // processingTime: <auto update>,
                status: {code: statusCodes.RUNNING},
                options: taskOptions,
                imagesCount: imagesCount
            };

            const PARALLEL_UPLOADS = 20;

            const eventEmitter = new events.EventEmitter();
            eventEmitter.setMaxListeners(2 * (2 + PARALLEL_UPLOADS + 1));

            const httpRequest = async (url, formData, headers = {}, validate) => {
                return new Promise((resolve, reject) => {
                    logger.debug(`Making HTTP request to: ${url}`);
                    
                    const parsedUrl = new URL(url);
                    const isHttps = parsedUrl.protocol === 'https:';
                    const httpModule = isHttps ? https : http;
                    
                    const requestOptions = {
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || (isHttps ? 443 : 80),
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: 'POST',
                        headers: {
                            ...headers
                        }
                    };

                    if (formData) {
                        // Add form-data headers
                        const formHeaders = formData.getHeaders();
                        requestOptions.headers = {
                            ...requestOptions.headers,
                            ...formHeaders
                        };
                        logger.debug(`FormData headers: ${JSON.stringify(formHeaders)}`);
                    }

                    logger.debug(`Request options: ${JSON.stringify(requestOptions, null, 2)}`);

                    const req = httpModule.request(requestOptions, (res) => {
                        logger.debug(`Response status: ${res.statusCode}`);
                        
                        let body = '';
                        res.on('data', (chunk) => {
                            body += chunk;
                        });
                        
                        res.on('end', () => {
                            logger.debug(`Response body length: ${body.length}`);
                            
                            if (res.statusCode !== 200) {
                                logger.error(`Non-200 status: ${res.statusCode}, body: ${body}`);
                                reject(new Error(`POST ${url} status is ${res.statusCode}, expected 200. Response: ${body}`));
                                return;
                            }
                            
                            // Handle empty response
                            if (!body || body.trim() === '') {
                                logger.error(`Empty response received from ${url}`);
                                reject(new Error(`Empty response received from ${url}`));
                                return;
                            }
                            
                            let parsedBody;
                            try {
                                parsedBody = JSON.parse(body);
                                logger.debug(`Successfully parsed JSON response`);
                            } catch (parseError) {
                                logger.error(`JSON parse error: ${parseError.message}, body: ${body}`);
                                reject(new Error(`Invalid JSON response from ${url}: ${body}`));
                                return;
                            }
                            
                            if (parsedBody.error) {
                                logger.error(`Server returned error: ${parsedBody.error}`);
                                reject(new Error(parsedBody.error));
                                return;
                            }
                            
                            if (validate !== undefined) {
                                try {
                                    validate(parsedBody);
                                    logger.debug(`Validation passed`);
                                } catch (validationError) {
                                    logger.error(`Validation error: ${validationError.message}`);
                                    reject(validationError);
                                    return;
                                }
                            }

                            resolve(parsedBody);
                        });
                    });
                    
                    req.on('error', (error) => {
                        logger.error(`HTTP request failed for ${url}: ${error.message}`);
                        reject(error);
                    });
                    
                    req.on('timeout', () => {
                        logger.error(`HTTP request timeout for ${url}`);
                        req.destroy();
                        reject(new Error(`Request timeout for ${url}`));
                    });
                    
                    if (formData) {
                        logger.debug(`Piping FormData to request`);
                        formData.pipe(req);
                    } else {
                        logger.debug(`Ending request without FormData`);
                        req.end();
                    }
                });
            };

            const taskNewInit = async () => {
                const formData = new FormData();
                
                formData.append('name', name);
                formData.append('options', JSON.stringify(taskOptions));
                formData.append('dateCreated', dateC.getTime().toString());
                
                if (skipPostProcessing) {
                    formData.append('skipPostProcessing', "true");
                }
                if (webhook) {
                    formData.append('webhook', webhook);
                }
                if (outputs) {
                    formData.append('outputs', outputs);
                }

                const headers = {
                    'set-uuid': uuid
                };

                return await httpRequest(
                    `${node.proxyTargetUrl()}/task/new/init?token=${node.getToken()}`,
                    formData,
                    headers,
                    (res) => {
                        if (res.uuid !== uuid) throw new Error(`set-uuid did not match, ${res.uuid} !== ${uuid}`);
                    }
                );
            };

            const taskNewUpload = async () => {
                const MAX_RETRIES = 5;

                const chunks = utils.chunkArray(fileNames, Math.ceil(fileNames.length / PARALLEL_UPLOADS));
                
                const uploadPromises = chunks.map(fileNames => {
                    return new Promise(async (resolve, reject) => {
                        let retries = 0;
                        
                        const performUpload = async () => {
                            try {
                                if (status.aborted) return resolve(); // Ignore if this was aborted by other code

                                const formData = new FormData();
                                
                                for (const fileName of fileNames) {
                                    const filePath = path.join(tmpPath, fileName);
                                    
                                    // Check if file exists before reading
                                    if (!fs.existsSync(filePath)) {
                                        throw new Error(`File not found: ${filePath}`);
                                    }
                                    
                                    // Get file stats
                                    const stats = fs.statSync(filePath);
                                    const fileSize = stats.size;
                                    logger.debug(`Adding file ${fileName} (${fileSize} bytes) to FormData`);
                                    
                                    // Use file stream with form-data (same as original node-libcurl approach)
                                    const fileStream = fs.createReadStream(filePath);
                                    formData.append('images', fileStream, {
                                        filename: fileName,
                                        contentType: 'application/octet-stream',
                                        knownLength: fileSize
                                    });
                                    logger.debug(`Successfully added ${fileName} as stream to FormData`);
                                }

                                const uploadUrl = `${node.proxyTargetUrl()}/task/new/upload/${uuid}?token=${node.getToken()}`;
                                logger.debug(`Uploading to: ${uploadUrl}`);
                                
                                const result = await httpRequest(
                                    uploadUrl,
                                    formData,
                                    {},
                                    (res) => {
                                        if (!res.success) throw new Error(`no success flag in task upload response`);
                                    }
                                );
                                
                                logger.debug(`Upload successful for files: ${fileNames.join(', ')}`);
                                
                                resolve(result);
                            } catch (err) {
                                if (status.aborted) return resolve(); // Ignore if this was aborted by other code

                                if (retries < MAX_RETRIES) {
                                    retries++;
                                    logger.warn(`File upload to ${node} failed, retrying... (${retries}): ${err.message}`);
                                    await utils.sleep(2000);
                                    await performUpload();
                                } else {
                                    reject(new Error(`${err.message}: maximum upload retries (${MAX_RETRIES}) exceeded`));
                                }
                            }
                        };

                        await performUpload();
                    });
                });

                await Promise.all(uploadPromises);
            };

            const taskNewCommit = async () => {
                return await httpRequest(`${node.proxyTargetUrl()}/task/new/commit/${uuid}?token=${node.getToken()}`);
            };

            let retries = 0;
            let status = {
                aborted: false
            };
            let dmHostname = null;
            eventEmitter.on('abort', () => {
                status.aborted = true;
            });

            const abortTask = () => {
                eventEmitter.emit('abort');
                if (dmHostname && autoscale){
                    const asr = asrProvider.get();
                    try{
                        asr.destroyMachine(dmHostname);
                    }catch(e){
                        logger.warn(`Could not destroy machine ${dmHostname}: ${e}`);
                    }
                }
            };

            const handleError = async (err) => {
                const taskTableEntry = await tasktable.lookup(uuid);
                if (taskTableEntry){
                    const taskInfo = taskTableEntry.taskInfo;
                    if (taskInfo){
                        taskInfo.status.code = statusCodes.FAILED;
                        await tasktable.add(uuid, { taskInfo, output: [err.message] }, token);
                        logger.warn(`Cannot forward task ${uuid} to processing node ${node}: ${err.message}`);
                    }
                }
                utils.rmdir(tmpPath);
                eventEmitter.emit('close');
            };

            const doUpload = async () => {
                const MAX_UPLOAD_RETRIES = 5;
                eventEmitter.emit('close');

                try{
                    await taskNewInit();
                    await taskNewUpload();
                    await taskNewCommit();
                }catch(e){
                    // Attempt to retry
                    if (retries < MAX_UPLOAD_RETRIES){
                        retries++;
                        logger.warn(`Attempted to forward task ${uuid} to processing node ${node} but failed with: ${e.message}, attempting again (retry: ${retries})`);
                        await utils.sleep(1000 * 5 * retries);

                        // If autoscale is enabled, simply retry on same node
                        // otherwise switch to another node
                        if (!autoscale){
                            const newNode = await nodes.findBestAvailableNode(imagesCount, true);
                            if (newNode){
                                node = newNode;
                                logger.warn(`Switched ${uuid} to ${node}`);
                            }else{
                                // No nodes available
                                logger.warn(`No other nodes available to process ${uuid}, we'll retry the same one.`);
                            }
                        }

                        await doUpload();
                    }else{
                        throw new Error(`Failed to forward task to processing node after ${retries} attempts. Try again later.`);
                    }
                }
            };

            // Add item to task table
            await tasktable.add(uuid, { taskInfo, abort: abortTask, output: ["Launching... please wait! This can take a few minutes."] }, token);

            // Send back response to user right away
            utils.json(res, { uuid });

            if (autoscale){
                const asr = asrProvider.get();
                try{
                    dmHostname = asr.generateHostname(imagesCount);
                    node = await asr.createNode(req, imagesCount, token, dmHostname, status);
                    if (!status.aborted) nodes.add(node);
                    else return;
                }catch(e){
                    const err = new Error("No nodes available (attempted to autoscale but failed). Try again later.");
                    logger.warn(`Cannot create node via autoscaling: ${e.message}`);
                    handleError(err);
                    return;
                }
            }

            try{
                await doUpload();
                eventEmitter.emit('close');

                await routetable.add(uuid, node, token);
                await tasktable.delete(uuid);

                utils.rmdir(tmpPath);
            }catch(e){
                handleError(e);
            }
        }else{
            throw new Error("No nodes available");
        }
    }
};