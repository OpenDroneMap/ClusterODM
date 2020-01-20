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
const logger = require('./logger');

let tasks = null;

// TODO: use redis to have a shared tasks table
// accessible from multiple proxies

// The task table keeps information (task info, console output) about tasks that 
// are waiting to be sent to a processing node or are being uploaded to a processing node or 
// have completed/failed and their processing node has been tore down

module.exports = {
    initialize: async function(){
        tasks = {};

        const cleanup = () => {
            const expires = 1000 * 60 * 60 * 24 * 2; // 2 days

            Object.keys(tasks).forEach(taskId => {
                if ((tasks[taskId].accessed + expires) < (new Date()).getTime()){
                    delete(tasks[taskId]);
                }
            });
        };

        setInterval(cleanup, 1000 * 60 * 60);
    },

    add: async function(taskId, obj, token){
        if (!taskId) throw new Error("taskId is not valid");
        if (!obj) throw new Error("obj is not valid");

        logger.debug(`Added ${taskId} --> ${JSON.stringify(obj)} in task table`);

        tasks[taskId] = {
            obj,
            token,
            accessed: new Date().getTime(),
        };
    },

    delete: async function(taskId){
        delete(tasks[taskId]);
    },

    lookup: async function(taskId){
        const entry = tasks[taskId];
        if (entry){
            entry.accessed = new Date().getTime();
            return entry.obj;
        }

        return null;
    },

    findByToken: async function(token){
        const result = {};
        for (let taskId in tasks){
            if (tasks[taskId].token === token){
                result[taskId] = tasks[taskId].obj;
            }
        }
        return result;
    }
};