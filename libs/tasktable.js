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

let tasks = null;

// TODO: use redis to have a shared tasks table
// accessible from multiple proxies

module.exports = {
    initialize: async function(){
        tasks = await this.loadFromDisk();

        logger.info(`Loaded ${Object.keys(tasks).length} tasks`);

        const cleanup = () => {
            const expires = 1000 * 60 * 60 * 24 * 2; // 2 days

            Object.keys(tasks).forEach(taskId => {
                if ((tasks[taskId].accessed + expires) < (new Date()).getTime()){
                    delete(tasks[taskId]);
                }
            });

            this.saveToDisk();
        };

        setInterval(cleanup, 1000 * 60 * 60);
    },

    add: async function(taskId, taskInfo){
        if (!taskId) throw new Error("taskId is not valid");
        if (!taskInfo) throw new Error("taskInfo is not valid");

        tasks[taskId] = {
            info: taskInfo,
            accessed: new Date().getTime()
        };
    },

    delete: async function(taskId){
        delete(tasks[taskId]);
    },

    lookup: async function(taskId){
        const entry = tasks[taskId];
        if (entry){
            entry.accessed = new Date().getTime();
            return entry.info;
        }

        return null;
    },

    saveToDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.writeFile('data/tasks.json', JSON.stringify(tasks), (err) => {
                if (err){
                    logger.warn("Cannot save tasks to disk: ${err.message}");
                    reject(err);
                }else{
                    resolve();
                }
            });
        });
    },

    loadFromDisk: async function(){
        return new Promise((resolve, reject) => {
            fs.exists("data/tasks.json", (exists) => {
                if (exists){
                    fs.readFile("data/tasks.json", (err, json) => {
                        if (err){
                            logger.warn("Cannot read tasks from disk: ${err.message}");
                            reject(err);
                        }else{
                            const content = JSON.parse(json);
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
            logger.info("Saved tasks to disk");
        }catch(e){
            logger.warn(e);
        }
    }
};