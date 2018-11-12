const logger = require('../logger');

module.exports = class AbstractCloudProvider{
    constructor(){
        logger.info(`Using ${this.constructor.name}`);
    }

    // Providers should override this function to validate a user token
    // and optionally provide a list of restrictions on the user

    // @param token {String} a token passed to the proxy to authenticate a request
    // @return {Object} See LocalCloudProvider for an example.
    async validate(token){
        throw new Error("Not Implemented");
    }
};