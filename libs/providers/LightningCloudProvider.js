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
const AbstractCloudProvider = require('../classes/AbstractCloudProvider');
const logger = require('../logger');
const axios = require('axios');
const ValueCache = require('../classes/ValueCache');

module.exports = class LightningCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();

        this.validateCache = new ValueCache({expires: 5 * 60 * 1000});

        this.urlBase = "http://localhost:5000/r";
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
};