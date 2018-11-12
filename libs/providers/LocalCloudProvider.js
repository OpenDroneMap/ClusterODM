const AbstractCloudProvider = require('../classes/AbstractCloudProvider');

module.exports = class LocalCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();
    }

    // Always return OK
    async validate(token){
        return {
            valid: true,
            limits: [] // No limits
        };
    }
};