const logger = require('../logger');
const url = require('url');
const axios = require('axios');

module.exports = class Node{
    constructor(nodeData){
        this.nodeData = nodeData;
    }

    async updateInfo(){
        try{
            let response = await axios.get(this.urlFor('/info'));
            if (response.status === 200){
                this.nodeData.info = response.data;
                this.nodeData.last_refreshed = new Date().getTime();
            }else{
                throw new Error(`Cannot update info for ${this}, returned status ${response.status}`);
            }
        }catch(e){
            logger.warn(`Cannot update info for ${this}: ${e.message}`);
        }
    }

    urlFor(pathname){
        const { hostname, port, token } = this.nodeData;
        const query = {};
        if (token) query.token = token;

        return url.format({protocol: 'http', hostname, port, pathname, query});
    }

    async getOptions(){
        try{
            let response = await axios.get(this.urlFor('/options'));
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
        return (this.nodeData || {}).info;
    }

    getVersion(){
        const info = this.getInfo();
        if (info){
            return info.version || "?";
        }else{
            return "?";
        }
    }

    isOnline(){
        return this.getLastRefreshed() >= (new Date()).getTime() - (1000 * 60 * 5);
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