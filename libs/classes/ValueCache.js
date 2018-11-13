module.exports = class ValueCache{
    constructor(options = {}){
        if (!options.expires) options.expires = -1;
        if (!options.cleanupInterval) options.cleanupInterval = 6 * 60 * 60 * 1000;

        this.options = options;
        this.cache = {};
        this.enabled = true;

        if (options.expires > 0) setInterval(this.cleanup, this.options.cleanupInterval);
    }

    disable(){
        this.enabled = false;
    }

    enable(){
        this.enabled = true;
    }

    cleanup(){
        Object.keys(this.cache).forEach(key => {
            if ((this.cache[key]._cachedtm + this.options.expires) < (new Date()).getTime()){
                delete(this.cache[key]);
            }
        });
    }

    get(key){
        if (this.enabled &&
            this.cache[key] !== undefined &&
           (this.options.expires < 0 || (this.cache[key]._cachedtm + this.options.expires) > (new Date()).getTime())){
            return this.cache[key].value;
        }
    }

    set(key, value){
        const obj = {
            value,
            _cachedtm: (new Date()).getTime()
        };
        this.cache[key] = obj;
        return obj.value;
    }
};