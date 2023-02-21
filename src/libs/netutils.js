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
"use strict";
const config = require('../config');
const nodes = require('./nodes');
const logger = require('./logger');
const routetable = require('./routetable');
const async = require('async');
const URL = require('url').URL;

module.exports = {
    publicAddressPath: function(urlPath, req, token){
        const addrBase = config.public_address ? 
                    config.public_address : 
                    `${config.use_ssl ? "https" : "http"}://${req.headers.host}`;
        const url = new URL(urlPath, addrBase);
        if (token){
            url.search = `token=${token}`;
        }
        return url.toString();
    },

    findTasksByNode: async function(node = null){
        const routes = await routetable.findByNode(node);

        return new Promise((resolve) => {
            const tasks = [];

            async.each(Object.keys(routes), (taskId, cb) => {
                (routes[taskId]).node.taskInfo(taskId).then((taskInfo) => {
                    if (!taskInfo.error) tasks.push(taskInfo);
                    cb();
                });
            }, () => {
                resolve(tasks);
            });
        });
    },

    removeAndCleanupNode: async function(node, asr = null){
        try{
            if (node.isAutoSpawned() && asr) await asr.destroyNode(node);
            await routetable.removeByNode(node);
            return nodes.remove(node);
        }catch(e){
            logger.warn(`Remove and cleanup failed: ${e.message}`);
            logger.debug(e);
            return false;
        }
    }
};