const Node = require('./classes/Node');
const fs = require('fs');
const logger = require('./logger');
let nodes = [];

module.exports = {
    initialize: async function(){
        await this.loadFromDisk();
        this.updateInfo();
        logger.info(`Loaded ${nodes.length} nodes`);
    },

    add: function(hostname, port, token){
        if (!hostname || !port) return false;

        if (!nodes.find(n => n.hostname === hostname && n.port === port)){
            const node = new Node({hostname, port, token, info: {}});
            nodes.push(node);
            this.saveToDisk();
            return node;
        }else{
            return false;
        }
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

    all: function(){
        return nodes;
    },

    nth: function(n){
        n = parseInt(n);
        if (isNaN(n)) return null;

        n -= 1;
        if (n >= 0 && n < nodes.length){
            return nodes[n];
        }else return null;
    },

    updateInfo: async function(){
        return await Promise.all(nodes.map(n => n.updateInfo()));
    },

    // Get first node thas has information updated
    referenceNode: function(){
        return nodes.find(n => n.getInfo() !== null && n.isOnline());
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
                            nodes = nodesjson.map(n => new Node(n));
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