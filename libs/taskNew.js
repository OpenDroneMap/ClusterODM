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
const Busboy = require('busboy');
const utils = require('./utils');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const probeImageSize = require('probe-image-size');
const Curl = require('node-libcurl').Curl;
const tasktable = require('./tasktable');
const routetable = require('./routetable');
const nodes = require('./nodes');
const odmOptions = require('./odmOptions');
const statusCodes = require('./statusCodes');

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
            });
        }
        if (options.saveFilesToDir){
            busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                if (fieldname === 'images'){
                    filename = utils.sanitize(filename);
                    
                    // Special case
                    if (filename === 'body.json') filename = '_body.json';

                    const name = path.basename(filename);
                    params.fileNames.push(name);
        
                    const saveTo = path.join(options.saveFilesToDir, name);
                    file.pipe(fs.createWriteStream(saveTo));
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

    augmentTaskOptions: function(req, taskOptions, token){
        if (!config.no_cluster){
            // We automatically set the "sm-cluster" parameter
            // to match the address that was used to reach nodeodm-proxy.
            // if "--split" is set.
            const addr = config.cluster_address ? 
                        config.cluster_address : 
                        `${config.use_ssl ? "https" : "http"}://${req.headers.host}`;
            const clusterUrl = `${addr}/?token=${token}`;

            let result = [];
            let foundSplit = false, foundSMCluster = false;
            taskOptions.forEach(to => {
                if (to.name === 'split'){
                    foundSplit = true;
                    result.push({name: to.name, value: to.value});
                }else if (to.name === 'sm-cluster'){
                    foundSMCluster = true;
                    result.push({name: to.name, value: clusterUrl});
                }else{
                    result.push({name: to.name, value: to.value});
                }
            });

            if (foundSplit && !foundSMCluster){
                result.push({name: 'sm-cluster', value: clusterUrl });
            }

            return result;
        }else{
            // Make sure the "sm-cluster" parameter is removed
            return taskOptions.filter(to => to.name !== 'sm-cluster');
        }
    },

    process: async function(req, res, cloudProvider, uuid, params, token, limits, getLimitedOptions){
        const tmpPath = path.join("tmp", uuid);
        const { options, taskName, skipPostProcessing, outputs, fileNames, imagesCount} = params;

        // Estimate image sizes
        const IMAGE_TARGET_SAMPLES = 3;
        let imageDimensions = {width: 0, height: 0},
            imgSamplesCount = 0;

        if (fileNames.length < 2){
            throw new Error(`Not enough images (${fileNames.length} files uploaded)`);
        }

        utils.shuffleArray(fileNames);

        for (let i = 0; i < fileNames.length; i++){
            const fileName = fileNames[i];
            const filePath = path.join(tmpPath, fileName);

            // Skip .txt,.zip files
            if (/.(txt|zip)$/i.test(filePath)) continue;

            let dims = {};
            try{
                dims = await probeImageSize(fs.createReadStream(filePath));
            }catch(e){
                // Some drones (ex. YUNEEC) produce images that don't seem
                // to follow proper image standards. In this case, we
                // simply make a higher range estimate
                dims = {width: 5000, height: 3750};
                console.warn(`${uuid}: cannot read image dimensions for ${filePath}`);
            }

            if (dims.width > 16 && dims.height > 16){
                imageDimensions.width += dims.width;
                imageDimensions.height += dims.height;
                if (++imgSamplesCount === IMAGE_TARGET_SAMPLES) break;
            }
        }

        if (imgSamplesCount === 0){
            throw new Error(`Not enough images. You need at least 2 images.`);
        }

        imageDimensions.width /= imgSamplesCount;
        imageDimensions.height /= imgSamplesCount;

        // Check with provider if we're allowed to process these many images
        // at this resolution
        const { approved, error } = await cloudProvider.approveNewTask(token, imagesCount, imageDimensions);
        if (!approved) throw new Error(error);

        const node = await nodes.findBestAvailableNode(imagesCount, true);
        if (node){
            // Validate options
            // Will throw an exception on failure
            let taskOptions = odmOptions.filterOptions(this.augmentTaskOptions(req, options, token), 
                                                        await getLimitedOptions(token, limits, node));

            const taskInfo = {
                uuid,
                name: taskName || "Unnamed Task",
                dateCreated: (new Date()).getTime(),
                processingTime: -1,
                status: {code: statusCodes.RUNNING},
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

            const curlErrorHandler = async err => {
                const taskInfo = (await tasktable.lookup(uuid)).taskInfo;
                if (taskInfo){
                    taskInfo.status.code = statusCodes.FAILED;
                    await tasktable.add(uuid, { taskInfo, output: [err.message] });
                    logger.warn(`Cannot forward task ${uuid} to processing node ${node}: ${err.message}`);
                }
                utils.rmdir(tmpPath);
                close();
            };

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
                        curlErrorHandler(e);
                    }
                }else{
                    curlErrorHandler(new Error(`statusCode is ${statusCode}, expected 200`));
                }
            });
            curl.on('error', curlErrorHandler);

            await tasktable.add(uuid, { taskInfo, abort: close, output: [""] });

            // Send back response to user
            utils.json(res, { uuid });

            curl.perform();
        }else{
            throw new Error("No nodes available");
        }
    }
};