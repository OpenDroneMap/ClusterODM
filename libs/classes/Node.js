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

    getInfo(){
        return this.nodeData.info;
    }

    isOnline(){
        return this.getLastRefreshed() >= (new Date()).getTime() - (1000 * 60 * 5);
    }

    getLastRefreshed(){
        return this.nodeData.last_refreshed || 0;
    }

    toString(){
        const { hostname, port } = this.nodeData;
        return `${hostname}:${port}`;
    }
};