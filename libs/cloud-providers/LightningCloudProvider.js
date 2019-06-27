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
const AbstractCloudProvider = require('../classes/AbstractCloudProvider');
const logger = require('../logger');
const axios = require('axios');
const utils = require('../utils');
const ValueCache = require('../classes/ValueCache');

module.exports = class LightningCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();

        this.validateCache = new ValueCache({expires: 5 * 60 * 1000});

        this.urlBase = "https://webodm.net/r";
        this.timeout = 10000;
    }

    urlFor(url){
        return `${this.urlBase}${url}`
    }

    async validate(token){
        if (!token) return {valid: false};
        const cached = this.validateCache.get(token);
        if (cached !== undefined) return cached;

        try{
            let response = await axios.post(this.urlFor('/tokens/validate'), { token }, { timeout: this.timeout });
            if (response.status === 200){
                let result = this.validateCache.set(token, response.data);
                return result;
            }else{
                logger.warn(`Cannot validate token ${token}, returned status ${response.status}`);
                return {
                    valid: false
                };
            }
        }catch(e){
            logger.warn(`Cannot validate token ${token}: ${e.message}`);
            return {
                valid: false
            };
        }
    }

    async approveNewTask(token, imagesCount, imageDimensions){
        if (!token) return {error: "Invalid token"};
        if (!imagesCount) return {error: "Invalid images count"};

        try{
            let response = await axios.post(this.urlFor('/tasks/approve'), { 
                    token,
                    imagesCount,
                    imageDimensions: JSON.stringify(imageDimensions)
                }, { timeout: this.timeout });

            if (response.status === 200){
                return response.data;
            }else{
                logger.warn(`Cannot approve task with ${token}:${imagesCount}:${resolution}, returned status ${response.status}`);
                return {error: `Cannot approve task. Please contact support. Service responded with status ${response.status}`};
            }
        }catch(e){
            logger.warn(`Cannot approve task with ${token}:${imagesCount}:${resolution}: ${e.message}`);
            return {error: `Cannot approve task. Please contact support. ${e.message}`};
        }
    }

    async taskFinished(token, taskInfo){
        if (!token){
            // Something is not right, notify an admin
            // as we cannot record this transaction
            logger.error(`Cannot record transaction, token is missing: ${JSON.stringify(taskInfo)}`);
            return;
        }
        if (!taskInfo) throw new Error("Invalid taskInfo parameter");

        const MAX_RETRIES = 10;
        for (let i = 0; i < MAX_RETRIES; i++){
            try{
                let response = await axios.post(this.urlFor('/tasks/finished'), { 
                        token,
                        taskInfo: JSON.stringify(taskInfo)
                    }, { timeout: this.timeout });
    
                if (response.status === 200){
                    const { error, credits_used } = response.data;
                    if (!error){
                        break; // Done!
                    }else{
                        logger.error(`/tasks/finished returned: ${error}, attempt (${i})`);
                    }
                }else{
                    logger.error(`Cannot call /tasks/finished for ${taskInfo.uuid}, ${token}, returned status ${response.status}, attempt (${i})`);
                }
            }catch(e){
                logger.error(`Cannot call /tasks/finished for ${taskInfo.uuid}, ${token}: ${e.message}, attempt (${i})`);
            }

            await utils.sleep(10000 * i);
        }
    }

    handleAuthInfo(req, res){
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({
            message: "Please enter your webodm.net credentials. If you don't have an account, register for free at https://webodm.net/register",
            loginUrl: "https://webodm.net/r/auth/getToken",
            registerUrl: null
        }));
    }
};