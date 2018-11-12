const AbstractCloudProvider = require('../classes/AbstractCloudProvider');
const logger = require('../logger');
const axios = require('axios');

module.exports = class LightningCloudProvider extends AbstractCloudProvider{
    constructor(){
        super();

        this.useCache = true;
        this.cacheTime = 5 * 60 * 1000;

        this.urlBase = "http://localhost:5000/r";
    }

    urlFor(url){
        return `${this.urlBase}${url}`
    }

    async validate(token){
        if (!token) return {valid: false};
        if (!this.validateCache) this.validateCache = {};
        if (this.useCache && this.validateCache[token] && 
            (this.validateCache[token]._cachedtm + this.cacheTime) > (new Date()).getTime()) return this.validateCache[token];
        
        try{
            let response = await axios.post(this.urlFor('/tokens/validate'), { token });
            if (response.status === 200){
                let result = response.data;
                result._cachedtm = new Date().getTime();
                this.validateCache[token] = result;
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