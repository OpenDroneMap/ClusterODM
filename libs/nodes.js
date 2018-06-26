const Node = require('./classes/Node');

let nodes = [];

module.exports = {
    add: function(hostname, port, token){
        if (!hostname || !port) return false;

        if (!nodes.find(n => n.hostname === hostname && n.port === port)){
            const node = new Node({hostname, port, token, info: {}});
            nodes.push(node);
            return node;
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
    }
};