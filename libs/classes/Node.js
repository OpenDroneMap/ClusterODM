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
const logger = require('../logger');
const url = require('url');
const axios = require('axios');

module.exports = class Node{
    constructor(hostname, port, token = "", info = {}){
        this.nodeData = {
            hostname,
            port,
            token,
            info
        };
        this.turn = 0;

        this.timeout = 10000;
    }

    static FromJSON(json){
        return new Node(json.hostname, json.port, json.token, json.info);
    }

    async updateInfo(){
        try{
            let response = await axios.get(this.urlFor('/info'), { timeout: this.timeout });
            if (response.status === 200){
                if (!response.data.error){
                    this.nodeData.info = response.data;
                    this.nodeData.last_refreshed = new Date().getTime();
                }else{
                    throw new Error(`Cannot update info for ${this}, error: ${response.data.error}`);
                }
            }else{
                this.nodeData.last_refreshed = 0;
                throw new Error(`Cannot update info for ${this}, returned status ${response.status}`);
            }
        }catch(e){
            logger.warn(`Cannot update info for ${this}: ${e.message}`);
            this.nodeData.last_refreshed = 0;
        }
    }

    async taskInfo(taskId){
        return this.getRequest(`/task/${taskId}/info`);
    }

    async taskOutput(taskId, line = 0){
        return this.getRequest(`/task/${taskId}/output`, {line});
    }

    async taskCancel(taskId){
        return this.postRequest(`/task/cancel`, {uuid: taskId});
    }

    async taskRemove(taskId){
        return this.postRequest(`/task/remove`, {uuid: taskId});
    }

    async postRequest(url, formData = {}, query = {}){
        try{
            let response = await axios.post(this.urlFor(url, query), formData, { 
                                timeout: this.timeout,
                            });
            if (response.status === 200){
                return response.data;
            }else{
                throw new Error(`Got response code: ${response.status}`);
            }
        }catch(e){
            return {error: e.message};
        }
    }

    async getRequest(url, query = {}){
        try{
            let response = await axios.get(this.urlFor(url, query), { timeout: this.timeout });
            if (response.status === 200){
                return response.data;
            }else{
                throw new Error(`Got response code: ${response.status}`);
            }
        }catch(e){
            return {error: e.message};
        }
    }

    urlFor(pathname, query = {}){
        const { hostname, port, token } = this.nodeData;
        const proto = port === 443 ? 'https' : 'http';
        if (token) query.token = token;

        return url.format({protocol: proto, hostname, port, pathname, query});
    }

    hostname(){
        return this.nodeData.hostname;
    }

    port(){
        return this.nodeData.port;
    }

    autoSpawned(){
        return this.nodeData.autoSpawned;
    }

    isLocked(){
        return !!this.nodeData.locked;
    }

    setLocked(flag){
        this.nodeData.locked = flag;
    }

    setAutoSpawned(flag){
        this.nodeData.autoSpawned = flag;
    }

    availableSlots(){
        return Math.max(0, this.getInfoProperty('maxParallelTasks', 0) - this.getInfoProperty('taskQueueCount', 0));
    }

    proxyTargetUrl(){
        const { hostname, port } = this.nodeData;

        return `http://${hostname}:${port}`; // TODO: add SSL support
    }

    getToken(){
        return this.nodeData.token;
    }

    async getOptions(){
        try{
            let response = await axios.get(this.urlFor('/options'),  { timeout: this.timeout });
            if (response.status === 200){
                return response.data;
            }else{
                throw new Error(`Cannot get options for ${this}, returned status ${response.status}`);
            }
        }catch(e){
            throw new Error(`Cannot get options for ${this}: ${e.message}`);
        }
    }

    getInfo(){
        return this.nodeData.info;
    }

    getInfoProperty(prop, defaultValue){
        const info = this.getInfo();
        if (info){
            return info[prop] !== undefined ? info[prop] : defaultValue;
        }else{
            return defaultValue;
        }
    }

    getVersion(){
        return this.getInfoProperty('version', '?');
    }

    getMaxParallelTasks(){
        return this.getInfoProperty('maxParallelTasks', '?');
    }

    getTaskQueueCount(){
        return this.getInfoProperty('taskQueueCount', '?');
    }

    isOnline(){
        return this.getLastRefreshed() >= (new Date()).getTime() - (1000 * 60 * 2);
    }

    getLastRefreshed(){
        return this.nodeData.last_refreshed || 0;
    }

    toJSON(){
        let clone = JSON.parse(JSON.stringify(this.nodeData));
        delete(clone.info);
        delete(clone.last_refreshed);
        return clone;
    }

    toString(){
        const { hostname, port } = this.nodeData;
        return `${hostname}:${port}`;
    }
};