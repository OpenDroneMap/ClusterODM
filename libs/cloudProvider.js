const logger = require('./logger');

let cloudProvider = null;

module.exports = {
    initialize: function(providerName){
        providerName = providerName[0].toUpperCase() + providerName.slice(1, providerName.length);
        try{
            cloudProvider = new (require('./providers/' + providerName + 'CloudProvider.js'))();
        }catch(e){
            logger.error(`Invalid cloud provider: ${providerName}. ${e}`);
            process.exit(1);
        }
        return cloudProvider;
    },

    get: function(){
        return cloudProvider;
    }
};