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
const fs = require('fs');
const logger = require('./logger');
const nodes = require('./nodes');

let routes = null;

// TODO: use redis to have a shared routing table
// accessible from multiple proxies

// The route table maps taskIDs to nodes and task owners (via token)

module.exports = {
    initialize: async function(){
        routes = await this.loadFromDisk();

        logger.info(`Loaded ${Object.keys(routes).length} routes`);

        const cleanup = () => {
            const expires = 1000 * 60 * 60 * 24 * 5; // 5 days

            Object.keys(routes).forEach(taskId => {
                if ((routes[taskId].accessed + expires) < (new Date()).getTime()){
                    delete(routes[taskId]);
                }
            });

            this.saveToDisk();
        };

        setInterval(cleanup, 1000 * 60 * 60);
    },

    add: async function(taskId, node, token){
        if (!node) throw new Error("Node is not valid");
        if (!taskId) throw new Error("taskId is not valid");

        routes[taskId] = {
            node,
            token,
            accessed: new Date().getTime()
        };

        this.saveToDisk();
    },

    lookup: async function(taskId){
        const entry = routes[taskId];
        if (entry){
            entry.accessed = new Date().getTime();
            return entry;
        }

        return null;
    },

    lookupNode: async function(taskId){
        const entry = await this.lookup(taskId);
        if (entry) return entry.node;

        return null;
    },

    lookupToken: async function(taskId){
        const entry = await this.lookup(taskId);
        if (entry) return entry.token;

        return null;
    },

    saveToDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.writeFile('data/routes.json', JSON.stringify(routes), (err) => {
                if (err){
                    logger.warn("Cannot save routes to disk: ${err.message}");
                    reject(err);
                }else{
                    resolve();
                }
            });
        });
    },

    loadFromDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.exists("data/routes.json", (exists) => {
                if (exists){
                    fs.readFile("data/routes.json", (err, json) => {
                        if (err){
                            logger.warn("Cannot read routes from disk: ${err.message}");
                            reject(err);
                        }else{
                            const content = JSON.parse(json);
                            const deleteList = [];

                            // Create Node class instances
                            for (let key of Object.keys(content)){
                                if (content[key].node){
                                    let cn = content[key].node;
                                    let n = nodes.find(n => n.hostname() === cn.hostname && n.port() === cn.port);
                                    if (n){
                                        content[key].node = n;
                                    }else{
                                        // Delete routes for which a node does not exist
                                        deleteList.push(key);
                                    }
                                }
                            }

                            deleteList.forEach(d => delete(content[d]));

                            resolve(content);
                        }
                    });
                }else{
                    resolve({});
                }
            });
        });
    },

    cleanup: async function(){
        try{
            await this.saveToDisk();
            logger.info("Saved routes to disk");
        }catch(e){
            logger.warn(e);
        }
    }
};