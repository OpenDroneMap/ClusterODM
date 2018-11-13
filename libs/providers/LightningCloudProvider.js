const AbstractCloudProvider = require('../classes/AbstractCloudProvider');
const logger = require('../logger');
const axios = require('axios');
const ValueCache = require('../classes/ValueCache');

module.exports = class LightningCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();

        this.validateCache = new ValueCache({expires: 5 * 60 * 1000});

        this.urlBase = "http://localhost:5000/r";
        this.timeout = 10000;
    }

    urlFor(url){
        return `${this.urlBase}${url}`
    }

    async validate(token){
        if (!token) return {valid: false};
        const cached = this.validateCache.get(token);
        if (cached !== undefined) return cached;

        try{
            let response = await axios.post(this.urlFor('/tokens/validate'), { token }, { timeout: this.timeout });
            if (response.status === 200){
                let result = this.validateCache.set(token, response.data);
                return result;
            }else{
                logger.warn(`Cannot validate token ${token}, returned status ${response.status}`);
                return {
                    valid: false
                };
            }
        }catch(e){
            logger.warn(`Cannot validate token ${token}: ${e.message}`);
            return {
                valid: false
            };
        }
    }
};