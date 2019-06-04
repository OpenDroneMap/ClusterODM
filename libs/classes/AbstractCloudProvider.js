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
const logger = require('../logger');

module.exports = class AbstractCloudProvider{
    constructor(){
        logger.info(`Cloud: ${this.constructor.name}`);
    }

    // Providers should override this function to validate a user token
    // and optionally provide a list of restrictions on the user

    // @param token {String} a token passed to the proxy to authenticate a request
    // @return {Object} See LocalCloudProvider for an example.
    async validate(token){
        throw new Error("Not Implemented");
    }

    // Override this function to approve or deny a request
    // for processing a new task based on the input images information.

    // @param token {String} a token passed to the proxy to authenticate a request
    // @param imagesCount {Number} number of images the user wants to process.
    // @param imageDimensions {Object} {width: N, height: N}. Average resolution of the images. These values are estimates.
    // @return {Object} See LocalCloudProvider for an example.
    async approveNewTask(token, imagesCount, imageDimensions){
        throw new Error("Not Implemented");
    }

    // Override this function to be notified when a task is finished
    // (regardless of whether the task finished successfully or failed)

    // @param token {String} a token passed to the proxy to authenticate a request
    // @param taskInfo {Object} task info as returned by the processing node.
    async taskFinished(token, taskInfo){
        throw new Error("Not Implemented");
    }


    // Override this to handle /auth/info
    handleAuthInfo(req, res){
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({
            message:"Authentication not available on this node",
            loginUrl:null,
            registerUrl:null
        }));
    }
};