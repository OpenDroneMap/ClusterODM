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
let routes = null;

// TODO: use redis to have a shared routing table
// accessible from multiple proxies

// TODO: cleanup routes based on last access
module.exports = {
    initialize: async function(){
        routes = {};
    },

    add: async function(taskId, node){
        if (!node) throw new Error("Node is not valid");
        if (!taskId) throw new Error("taskId is not valid");

        routes[taskId] = node;
    },

    lookup: async function(taskId){
        return routes[taskId]; 
    }
};