"use strict";

const uuidv4 = require('uuid/v4');
const fs = require('fs');
const async = require('async');
const  logger = require('./logger');

module.exports = {
	get: function(scope, prop, defaultValue){
		let parts = prop.split(".");
		let current = scope;
		for (let i = 0; i < parts.length; i++){
			if (current[parts[i]] !== undefined && i < parts.length - 1){
				current = current[parts[i]];
			}else if (current[parts[i]] !== undefined && i < parts.length){
				return current[parts[i]];
			}else{
				return defaultValue;
			}
		}	
		return defaultValue;
    },
    
    temporaryFilePath: function(){
        return `tmp/${uuidv4()}`;
    } ,

    cleanupTemporaryDirectory: async function(wipeAll = false){
        return new Promise((resolve, reject) => {
            fs.readdir('tmp', (err, entries) => {
                if (err) reject(err);
                else{
                    async.eachSeries(entries, (entry, cb) => {
                        if (entry === '.gitignore'){ 
                            cb(); // skip .gitignore
                            return;
                        }
                        
                        fs.stat(`tmp/${entry}`, function(err, stats){
                            if (err) cb(err);
                            else{
                                const mtime = new Date(stats.mtime);
                                if (wipeAll || (new Date().getTime() - mtime.getTime() > 1000 * 60 * 60 * 48)){
                                    logger.info("Cleaning up " + entry);
                                    fs.unlink(`tmp/${entry}`, cb);
                                }else{
                                    cb();
                                }
                            }
                        });
                    }, err => {
                        if (err) reject();
                        else resolve();
                    });
                }
            });
        })
    }
};