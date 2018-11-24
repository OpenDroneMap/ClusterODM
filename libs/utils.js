/**
 *  nodeodm-proxy - A reverse proxy, load balancer and task tracker for NodeODM
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

const uuidv4 = require('uuid/v4');
const fs = require('fs');
const async = require('async');
const  logger = require('./logger');
const Readable = require('stream').Readable;

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
    },

    stringToStream: function(str){
        const s = new Readable();
        s._read = () => {}; // redundant? see update below
        s.push(str);
        s.push(null);
        return s;
    }
};