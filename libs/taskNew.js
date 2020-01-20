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
const Curl = require('node-libcurl').Curl;
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

module.exports = {
    // @return {object} Context object with methods and variables to use during task/new operations 
    createContext: function(req, res){
        const uuid = utils.uuidv4(); // TODO: add support for set-uuid header parameter
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
        
        const busboy = new Busboy({ headers: req.headers });

        const params = {
            options: null,
            taskName: "",
            skipPostProcessing: false,
            outputs: null,
            dateCreated: null,
            error: null,

            fileNames: [],
            imagesCount: 0
        };

        if (options.parseFields){
            busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated) {
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
            });
        }
        if (options.saveFilesToDir){
            busboy.on('file', async function(fieldname, file, filename, encoding, mimetype) {
                if (fieldname === 'images'){
                    filename = utils.sanitize(filename);
                    
                    // Special case
                    if (filename === 'body.json') filename = '_body.json';

                    filename = await assureUniqueFilename(options.saveFilesToDir, filename);

                    const name = path.basename(filename);
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
                    };
                    req.on('close', handleClose);

                    file.on('end', () => {
                        req.removeListener('close', handleClose);
                        saveStream = null;
                    });

                    saveStream = fs.createWriteStream(saveTo)
                    file.pipe(saveStream);
                    params.imagesCount++;
                }
            });
        }
        busboy.on('finish', function(){
            onFinish(params);
        });
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
        const { options, taskName, skipPostProcessing, outputs, dateCreated, fileNames, imagesCount} = params;

        if (fileNames.length < 2){
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

            const curlInstance = (done, onError, url, body, validate) => {
                // We use CURL, because NodeJS libraries are buggy
                const curl = new Curl(),
                      close = curl.close.bind(curl);
                
                const tryClose = () => {
                    try{
                        close();
                    }catch(e){
                        logger.warn(`Cannot close cURL: ${e.message}`);
                    }
                    eventEmitter.removeListener('abort', tryClose);
                    eventEmitter.removeListener('close', tryClose);
                };

                eventEmitter.on('abort', tryClose);
                eventEmitter.on('close', tryClose);

                curl.on('end', async (statusCode, body, headers) => {
                    try{
                        if (statusCode === 200){
                            body = JSON.parse(body);
                            if (body.error) throw new Error(body.error);
                            if (validate !== undefined) validate(body);

                            done();
                        }else{
                            throw new Error(`POST ${url} statusCode is ${statusCode}, expected 200`);
                        }
                    }catch(e){
                        onError(e);
                    }
                });

                curl.on('error', onError);

                // logger.info(`Curl URL: ${url}`);
                // logger.info(`Curl Body: ${JSON.stringify(body)}`);

                curl.setOpt(Curl.option.URL, url);
                curl.setOpt(Curl.option.HTTPPOST, body || []);
                if (config.upload_max_speed) curl.setOpt(Curl.option.MAX_SEND_SPEED_LARGE, config.upload_max_speed);
                // abort if slower than 30 bytes/sec during 1600 seconds */
                curl.setOpt(Curl.option.LOW_SPEED_TIME, 1600);
                curl.setOpt(Curl.option.LOW_SPEED_LIMIT, 30);
                curl.setOpt(Curl.option.HTTPHEADER, [
                    'Content-Type: multipart/form-data'
                ]);

                return curl;
            };

            const taskNewInit = async () => {
                return new Promise((resolve, reject) => {
                    const body = [];
                    body.push({
                        name: 'name',
                        contents: name
                    });
                    body.push({
                        name: 'options',
                        contents: JSON.stringify(taskOptions)
                    });
                    body.push({
                        name: 'dateCreated',
                        contents: dateC.getTime().toString()
                    });
                    if (skipPostProcessing){
                        body.push({
                            name: 'skipPostProcessing',
                            contents: "true"
                        });
                    }
                    if (outputs){
                        body.push({
                            name: 'outputs',
                            contents: outputs
                        });
                    }

                    const curl = curlInstance(resolve, reject, 
                        `${node.proxyTargetUrl()}/task/new/init?token=${node.getToken()}`,
                        body,
                        (res) => {
                            if (res.uuid !== uuid) throw new Error(`set-uuid did not match, ${res.uuid} !== ${uuid}`);
                        });
                    
                    curl.setOpt(Curl.option.HTTPHEADER, [
                        'Content-Type: multipart/form-data',
                        `set-uuid: ${uuid}`
                    ]);
                    curl.perform();
                });
            };

            const taskNewUpload = async () => {
                return new Promise((resolve, reject) => {
                    const MAX_RETRIES = 5;

                    const chunks = utils.chunkArray(fileNames, Math.ceil(fileNames.length / PARALLEL_UPLOADS));
                    let completed = 0;
                    const done = () => {
                        if (++completed >= chunks.length) resolve();
                    };
                    
                    chunks.forEach(fileNames => {
                        let retries = 0;
                        const body = fileNames.map(f => { return { name: 'images', file: path.join(tmpPath, f) } });
                        
                        const curl = curlInstance(done, async (err) => {
                                if (status.aborted) return; // Ignore if this was aborted by other code

                                if (retries < MAX_RETRIES){
                                    retries++;
                                    logger.warn(`File upload to ${node} failed, retrying... (${retries})`);
                                    await utils.sleep(2000);
                                    curl.perform();
                                }else{
                                    reject(new Error(`${err.message}: maximum upload retries (${MAX_RETRIES}) exceeded`));
                                }
                            },
                            `${node.proxyTargetUrl()}/task/new/upload/${uuid}?token=${node.getToken()}`,
                            body,
                            (res) => {
                                if (!res.success) throw new Error(`no success flag in task upload response`);
                            });

                        curl.perform();
                    });
                });
            };

            const taskNewCommit = async () => {
                return new Promise((resolve, reject) => {
                    const curl = curlInstance(resolve, reject, `${node.proxyTargetUrl()}/task/new/commit/${uuid}?token=${node.getToken()}`);
                    curl.perform();
                });
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
                            node = await nodes.findBestAvailableNode(imagesCount, true);
                            logger.warn(`Switched ${uuid} to ${node}`);
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