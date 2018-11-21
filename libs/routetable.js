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

module.exports = {
    initialize: async function(){
        routes = {};

        const cleanup = () => {
            const expires = 1000 * 60 * 60 * 24 * 5; // 5 days

            Object.keys(routes).forEach(taskId => {
                if ((routes[taskId].accessed + expires) < (new Date()).getTime()){
                    delete(routes[taskId]);
                }
            });
        };

        setInterval(cleanup, 1000 * 60 * 60 * 4);
    },

    add: async function(taskId, node){
        if (!node) throw new Error("Node is not valid");
        if (!taskId) throw new Error("taskId is not valid");

        routes[taskId] = {
            node,
            accessed: new Date().getTime()
        };
    },

    lookup: async function(taskId){
        const entry = routes[taskId];
        if (entry){
            entry.accessed = new Date().getTime();
            return entry.node;
        }

        return null;
    }
};