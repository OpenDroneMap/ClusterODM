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
const LightningCloudProvider = require('./LightningCloudProvider');

module.exports = class LightningDevCloudProvider extends LightningCloudProvider{
    constructor(){
        super();
        this.validateCache.disable();
        this.urlBase = "http://localhost:5000/r";
    }

    handleAuthInfo(req, res){
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({
            message: "Please enter your localhost credentials. If you don't have an account, register for free at http://localhost:5000/register",
            loginUrl:  this.urlBase + "/auth/getToken",
            registerUrl: null
        }));
    }
};