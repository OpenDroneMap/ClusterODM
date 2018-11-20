let routes = null;


// TODO: use redis to have a shared routing table
// accessible from multiple proxies

// TODO: cleanup routes based on last access
module.exports = {
    initialize: async function(){
        routes = {};
    },

    add: async function(taskId, node){
        if (!node) throw new Error("Node is not valid");
        if (!taskId) throw new Error("taskId is not valid");

        routes[taskId] = node;
    },

    lookup: async function(taskId){
        return routes[taskId]; 
    }
};