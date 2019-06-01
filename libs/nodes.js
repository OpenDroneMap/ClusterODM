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
const Node = require('./classes/Node');
const fs = require('fs');
const logger = require('./logger');
let nodes = [];
let initialized = false;

module.exports = {
    initialize: async function(){
        if (initialized) throw new Error("Already initialized");

        await this.loadFromDisk();
        this.updateInfo();
        logger.info(`Loaded ${nodes.length} nodes`);

        setInterval(() => {
            this.updateInfo()
        }, 60 * 1000);

        initialized = true;
    },

    addUnique: function(hostname, port, token){
        if (!hostname || !port) return false;

        if (!nodes.find(n => n.hostname() === hostname && n.port() === port)){
            const node = new Node(hostname, port, token);
            this.add(node);
            return node;
        }else{
            return false;
        }
    },

    add: function(node){
        nodes.push(node);
        this.saveToDisk();
        return node;
    },

    remove: function(node){
        if (node){
            nodes = nodes.filter(n => n !== node);
            this.saveToDisk();
            return true;
        }else{
            return false;
        }
    },

    lock: function(node){
        if (node){
            node.setLocked(true);
            this.saveToDisk();
            return true;
        }else{
            return false;
        }
    },

    unlock: function(node){
        if (node){
            node.setLocked(false);
            this.saveToDisk();
            return true;
        }else{
            return false;
        }
    },

    all: function(){
        return nodes;
    },

    find: function(match){
        return nodes.find(match);
    },

    nth: function(n){
        n = parseInt(n);
        if (isNaN(n)) return null;

        n -= 1;
        if (n >= 0 && n < nodes.length){
            return nodes[n];
        }else return null;
    },

    online: function(){
        return nodes.filter(n => n.isOnline());
    },

    updateInfo: async function(){
        return await Promise.all(nodes.map(n => n.updateInfo()));
    },

    // Reference node is the one used to generate
    // node information for the proxy (for example,
    // when returning calls to /info or /options)
    referenceNode: function(){
        return nodes.find(n => n.isOnline());
    },

    maxTurnNumber: function(){
        return Math.max(...nodes.map(n => n.turn));
    },

    clearTurnNumbers: function(){
        nodes.forEach(n => n.turn = 0);
    },

    findBestAvailableNode: async function(numImages, update = false){
        if (update) await this.updateInfo();

        let maxTurnNumber = this.maxTurnNumber();
        if (maxTurnNumber > 2000000000){
            this.clearTurnNumbers();
            maxTurnNumber = 0;
        }

        const candidates = nodes.filter(n => n.isOnline() && 
                                             !n.isLocked() &&
                                            (!n.getInfo().maxImages || n.getInfo().maxImages >= numImages));
        if (!candidates.length) return null;

        let sorted = candidates.map(n => {
            return {
                node: n,
                maxImages: n.getInfo().maxImages ? n.getInfo().maxImages : 999999999,
                slots: Math.max(0, n.getInfo().maxParallelTasks - n.getInfo().taskQueueCount),
                queueCount: n.getInfo().taskQueueCount
            };
        });

        // Sort by node with smallest maxImages value
        // tie break by most available slots
        // and further by least queue count
        // and further by turn number
        sorted.sort((a, b) => {
            if (a.maxImages < b.maxImages) return -1;
            else if (a.maxImages > b.maxImages) return 1;
            else if (a.slots > b.slots) return -1;
            else if (a.slots < b.slots) return 1;
            else if (a.queueCount < b.queueCount) return -1;
            else if (a.node.turn < b.node.turn) return -1;
            else return 1;
        });
        
        let bestNode = null;
        for (let i = 0; i < sorted.length; i++){
            if (sorted[i].slots > 0) {
                bestNode = sorted[i].node;
                break;
            }
        }

        // All nodes are full, pick the first
        if (!bestNode) bestNode = sorted[0].node;
        bestNode.turn = maxTurnNumber + 1;
        return bestNode;
    },

    saveToDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.writeFile('data/nodes.json', JSON.stringify(nodes), (err) => {
                if (err){
                    logger.warn("Cannot save nodes to disk: ${err.message}");
                    reject(err);
                }else{
                    resolve();
                }
            });
        });
    },

    loadFromDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.exists("data/nodes.json", (exists) => {
                if (exists){
                    fs.readFile("data/nodes.json", (err, json) => {
                        if (err){
                            logger.warn("Cannot read nodes from disk: ${err.message}");
                            reject(err);
                        }else{
                            const nodesjson = JSON.parse(json);
                            nodes = nodesjson.map(n => Node.FromJSON(n));
                            resolve();
                        }
                    });
                }else{
                    resolve();
                }
            });
        });
    },

    cleanup: async function(){
        try{
            await this.saveToDisk();
            logger.info("Saved nodes to disk");
        }catch(e){
            logger.warn(e);
        }
    }
};