/**
 *  ClusterODM - A reverse proxy, load balancer and task tracker for NodeODM
 *  Copyright (C) 2018-present MasseranoLabs LLC
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
"use strict";
module.exports = {
    // Options with limits applied
    optionsWithLimits: function(odmOptions, limitOptions){
        if (!limitOptions) return odmOptions;

        let result = [];

        for (let i in odmOptions){
            let odmOption = odmOptions[i];

            // Always filter out certain options which might be available
            // on single nodes, but not through our proxy.
            if (['max-concurrency'].indexOf(odmOption.name) !== -1) continue;

            if (limitOptions[odmOption.name] !== undefined){
                let lo = limitOptions[odmOption.name];

                let option = Object.assign({}, odmOption);

                // Replace domain and value if necessary
                if (lo.domain !== undefined) option.domain = lo.domain;
                if (lo.value !== undefined) option.value = lo.value;

                result.push(option);
            }else{
                // No limits on this one
                result.push(Object.assign({}, odmOption));
            }
        }

        return result;
    },

    // Checks that the options (as received from the rest endpoint)
	// Are valid and within proper ranges.
    // @param options[] options passed from user
    // @param odmOptions[] options values from /options call
	filterOptions: function(options, odmOptions){
        if (typeof options === "string") options = JSON.parse(options);
        if (!Array.isArray(options)) options = [];

        let result = [];
        let errors = [];
        let addError = function(opt, descr){
            errors.push({
                name: opt.name,
                error: descr
            });
        };

        let typeConversion = {
            'float': Number.parseFloat,
            'int': Number.parseInt,
            'bool': function(value){
                if (value === 'true' || value === '1') return true;
                else if (value === 'false' || value === '0') return false;
                else if (typeof value === 'boolean') return value;
                else throw new Error(`Cannot convert ${value} to boolean`);
            },
            'string': function(value){
                return value; // No conversion needed
            },
            'path': function(value){
                return value; // No conversion needed
            },
            'enum': function(value){
                return value; // No conversion needed
            }
        };
        
        let domainChecks = [
            {
                regex: /^(positive |negative )?(integer|float)$/, 
                validate: function(matches, value){
                    if (matches[1] === 'positive ') return value >= 0;
                    else if (matches[1] === 'negative ') return value <= 0;
                    
                    else if (matches[2] === 'integer') return Number.isInteger(value);
                    else if (matches[2] === 'float') return Number.isFinite(value);
                }
            },
            {
                regex: /^percent$/,
                validate: function(matches, value){
                    return value >= 0 && value <= 100;
                }
            },
            {
                regex: /^(float|integer): ([\-\+\.\d]+) <= x <= ([\-\+\.\d]+)$/,
                validate: function(matches, value){
                    let [str, type, lower, upper] = matches;
                    let parseFunc = type === 'float' ? parseFloat : parseInt;
                    lower = parseFunc(lower);
                    upper = parseFunc(upper);
                    return value >= lower && value <= upper;						
                }
            },
            {
                regex: /^(float|integer) (>=|>|<|<=) ([\-\+\.\d]+)$/,
                validate: function(matches, value){
                    let [str, type, oper, bound] = matches;
                    let parseFunc = type === 'float' ? parseFloat : parseInt;
                    bound = parseFunc(bound);
                    switch(oper){
                        case '>=':
                            return value >= bound;
                        case '>':
                            return value > bound;
                        case '<=':
                            return value <= bound;
                        case '<':
                            return value < bound;
                        default:
                            return false;
                    }
                }
            },
            {
                regex: /^(string|path)$/,
                validate: function(){
                    return true; // All strings/paths are fine
                }
            }
        ];

        let checkDomain = function(domain, value){
            if (Array.isArray(domain)){
                // Special case for enum checks
                if (domain.indexOf(value) === -1) throw new Error(`Invalid value ${value} (not in enum)`);
            }else{
                let matches,
                    dc = domainChecks.find(dc => matches = domain.match(dc.regex));

                if (dc){
                    if (!dc.validate(matches, value)) throw new Error(`Invalid value ${value} (out of range)`);
                }else{
                    throw new Error(`Domain value cannot be handled: '${domain}' : '${value}'`);
                }
            }
        };

        // Scan through all possible options
        for (let odmOption of odmOptions){
            // Was this option selected by the user?
            /*jshint loopfunc: true */
            let opt = options.find(o => o.name === odmOption.name);
            if (opt){
                try{
                    // Convert to proper data type
                    let value = typeConversion[odmOption.type](opt.value);

                    // Domain check
                    if (odmOption.domain){
                        checkDomain(odmOption.domain, value);
                    }

                    result.push({
                        name: odmOption.name,
                        value: value
                    });
                }catch(e){
                    addError(opt, e.message);						
                }
            }
        }

        if (errors.length > 0) throw new Error(JSON.stringify(errors));
        return result;
	}
};