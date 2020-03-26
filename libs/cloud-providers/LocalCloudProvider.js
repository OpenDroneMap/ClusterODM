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

module.exports = class LocalCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();
    }

    // Validate token
    async validate(token){
        if (!token) return {error: "Invalid token"
        }else{
            return {
                valid: true,
                limits: [] // No limits
            };
        }        
    }
    
    // Always approve
    async approveNewTask(token, imagesCount){
        return {approved: true, error: ""};
    }

    // Do nothing
    async taskFinished(token, taskInfo){}
};
