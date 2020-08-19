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
                    
                    if (!filename.endsWith(".zip"))
                    {
                      params.imagesCount++;
                    }
                }
            });
        }
        busboy.on('finish', function(){
        	try
        	{
	        	if (params.imagesCount === 0 && params.options != null)
	            {
	              var joOptions = JSON.parse(params.options);
	        	
	        	  var imagesIndex = -1;
	        	  
	              for (var i = 0; i < joOptions.length; ++i)
	              {
	                if (joOptions[i].name === "imagesCount")
	                {
	                  params.imagesCount = joOptions[i].value;
	                  imagesIndex = i;
	                  break;
	                }
	              }
	              
	              if (imagesIndex != -1)
	              {
	                joOptions.splice(imagesIndex, 1);
	                params.options = JSON.stringify(joOptions);
	              }
	            }
        	}
        	catch(e)
        	{
              logger.warn("Error encountered while getting imagesCount ${e}. Setting imagesCount to 1500");
              params.imagesCount = 1500;
        	}
        	
        	if (params.imagesCount === 0)
            {
              logger.warn("Imagescount is zero? This makes no sense. Setting imagesCount to 1500");
              params.imagesCount = 1500;
            }
        	
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
        const { options, taskName, skipPostProcessing, outputs, dateCreated, fileNames, imagesCount} = params;

//        if (fileNames.length < 2){
//            throw new Error(`Not enough images (${fileNames.length} files uploaded)`);
//        }

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

            // Get read to forward the task to the node
            // (using CURL, because NodeJS libraries are buggy)
            const curl = new Curl(),
                close = curl.close.bind(curl);

            const multiPartBody = fileNames.map(f => { return { name: 'images', file: path.join(tmpPath, f) } });
            multiPartBody.push({
                name: 'name',
                contents: name
            });
            multiPartBody.push({
                name: 'options',
                contents: JSON.stringify(taskOptions)
            });
            multiPartBody.push({
                name: 'dateCreated',
                contents: dateC.getTime().toString()
            });
            if (skipPostProcessing){
                multiPartBody.push({
                    name: 'skipPostProcessing',
                    contents: "true"
                });
            }
            if (outputs){
                multiPartBody.push({
                    name: 'outputs',
                    contents: outputs
                });
            }

            const asyncErrorHandler = async err => {
                const taskTableEntry = await tasktable.lookup(uuid);
                if (taskTableEntry){
                    const taskInfo = taskTableEntry.taskInfo;
                    if (taskInfo){
                        taskInfo.status.code = statusCodes.FAILED;
                        await tasktable.add(uuid, { taskInfo, output: [err.message] });
                        logger.warn(`Cannot forward task ${uuid} to processing node ${node}: ${err.message}`);
                    }
                }
                utils.rmdir(tmpPath);

                try{
                    close();
                }catch(e){
                    logger.warn(`Cannot close cURL: ${e.message}`);
                }
            };

            curl.on('end', async function (statusCode, body, headers){
                if (statusCode === 200){
                    try{
                        body = JSON.parse(body);
                        if (body.error) throw new Error(body.error);
                        if (body.uuid !== uuid) throw new Error(`set-uuid did not match, ${body.uuid} !== ${uuid}`);
                    
                        await routetable.add(uuid, node, token);
                        await tasktable.delete(uuid);

                        utils.rmdir(tmpPath);
                    }catch(e){
                        asyncErrorHandler(e);
                    }
                }else{
                    asyncErrorHandler(new Error(`statusCode is ${statusCode}, expected 200`));
                }
            });
            
            const MAX_UPLOAD_RETRIES = 5;
            let status = {
                aborted: false,
                retries: 0
            };
            let dmHostname = null;

            curl.on('error', async err => {
                // Attempt to retry
                if (status.retries < MAX_UPLOAD_RETRIES){
                    status.retries++;
                    logger.warn(`Attempted to forward task ${uuid} to processing node ${node} but failed with: ${err.message}, attempting again (retry: ${status.retries})`);
                    await utils.sleep(1000 * 5 * status.retries);

                    // If autoscale is enabled, simply retry on same node
                    // otherwise switch to another node
                    if (!autoscale){
                        node = await nodes.findBestAvailableNode(imagesCount, true);
                        logger.warn(`Switched ${uuid} to ${node}`);
                        curl.setOpt(Curl.option.URL, `${node.proxyTargetUrl()}/task/new?token=${node.getToken()}`);
                    }

                    curl.perform();
                }else{
                    asyncErrorHandler(err);
                }
            });

            const abortTask = () => {
                status.aborted = true;
                if (dmHostname && autoscale){
                    const asr = asrProvider.get();
                    try{
                        asr.destroyMachine(dmHostname);
                    }catch(e){
                        logger.warn(`Could not destroy machine ${dmHostname}: ${e}`);
                    }
                } 
                close();
            };
            await tasktable.add(uuid, { taskInfo, abort: abortTask, output: ["Launching... please wait! This can take a few minutes."] });

            // Send back response to user
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
                    asyncErrorHandler(err);
                    return;
                }
            }

            curl.setOpt(Curl.option.URL, `${node.proxyTargetUrl()}/task/new?token=${node.getToken()}`);
            if (config.upload_max_speed) curl.setOpt(Curl.option.MAX_SEND_SPEED_LARGE, config.upload_max_speed);
            // abort if slower than 30 bytes/sec during 1600 seconds */
            curl.setOpt(Curl.option.LOW_SPEED_TIME, 1600);
            curl.setOpt(Curl.option.LOW_SPEED_LIMIT, 30);
            curl.setOpt(Curl.option.HTTPPOST, multiPartBody);
            curl.setOpt(Curl.option.HTTPHEADER, [
                'Content-Type: multipart/form-data',
                `set-uuid: ${uuid}`
            ]);

            curl.perform();
        }else{
            throw new Error("No nodes available");
        }
    }
};