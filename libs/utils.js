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

const uuidv4 = require('uuid/v4');
const fs = require('fs');
const async = require('async');
const logger = require('./logger');
const Readable = require('stream').Readable;
const rimraf = require('rimraf');
const child_process = require('child_process');
const os = require('os');
const path = require('path');

const tmpUploadsMap = {}; // tmp dir entries --> number of files

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
        return path.join('tmp', uuidv4());
    },

    uuidv4: function(){
        return uuidv4();
    },

    shuffleArray: function(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    },

    cleanupTemporaryDirectory: async function(staleUploadsTimeout = 0){
        const self = this;

        return new Promise((resolve, reject) => {
            fs.readdir('tmp', async (err, entries) => {
                if (err) reject(err);
                else{
                    for (let entry of entries){
                        if (entry === '.gitignore') continue;

                        let stale = false;
                        let tmpPath = path.join('tmp', entry);

                        if (staleUploadsTimeout > 0){
                            try{
                                const fileCount = await self.filesCount(tmpPath);
    
                                if (tmpUploadsMap[entry] === undefined){
                                    tmpUploadsMap[entry] = {
                                        fileCount, 
                                        lastUpdated: new Date().getTime(),
                                        committed: false
                                    };
                                }else{
                                    const prevFileCount = tmpUploadsMap[entry].fileCount;
                                    stale = !tmpUploadsMap[entry].committed && 
                                            prevFileCount === fileCount && 
                                            (new Date().getTime() - tmpUploadsMap[entry].lastUpdated > 1000 * 60 * 60 * staleUploadsTimeout);

                                    // Update if the count has changed
                                    if (prevFileCount !== fileCount){
                                        tmpUploadsMap[entry].fileCount = fileCount;
                                        tmpUploadsMap[entry].lastUpdated = new Date().getTime();
                                    }
                                }
                            }catch(e){
                                logger.error(e);
                            }
                        }
                        
                        // This is async, it will not block!
                        fs.stat(tmpPath, function(err, stats){
                            if (err) logger.error(err);
                            else{
                                const mtime = new Date(stats.mtime);
                                if (stale || (new Date().getTime() - mtime.getTime() > 1000 * 60 * 60 * 48)){
                                    logger.info("Cleaning up " + entry + " " + (stale ? "[stale]" : ""));
                                    self.rmfr(tmpPath, err => {
                                        if (err) logger.error(err);
                                    });
                                    delete (tmpUploadsMap[entry]);
                                }
                            }
                        });
                    }
                    
                    // Remove entries in the upload map that aren't in tmp dir
                    // to avoid memory leaks
                    for (let entry of Object.keys(tmpUploadsMap)){
                        if (entries.indexOf(entry) === -1){
                            delete (tmpUploadsMap[entry]);
                        }
                    }

                    resolve();
                }
            });
        })
    },

    markTaskAsCommitted: function(taskId){
        // Avoid mistakely deleting a task's
        // files while they are being uploaded to a node
        if (tmpUploadsMap[taskId] !== undefined){
            tmpUploadsMap[taskId].committed = true;
        }
    },

    filesCount: async function(dir){
        return new Promise((resolve, reject) => {
            fs.readdir(dir, (err, files) => {
                if (err) reject(err);
                else resolve(files.length);
            });
        });
    },

    stringToStream: function(str){
        const s = new Readable();
        s._read = () => {}; // redundant? see update below
        s.push(str);
        s.push(null);
        return s;
    },

     // min and max included
    randomIntFromInterval: function(min,max){
        return Math.floor(Math.random()*(max-min+1)+min);
    },

    rmdir: function(dir){
        fs.exists(dir, exists => {
            if (exists){
                this.rmfr(dir, err => {
                    if (err) logger.warn(`Cannot delete ${dir}: ${err}`);
                });
            }
        });
    },

    // rm -fr implementation. dir is not checked, so this could wipe out your system.
    rmfr: function(dir, cb){
        if (['darwin', 'linux', 'freebsd'].indexOf(os.platform()) !== -1){
            // Rimraf leaks on Linux, use faster/better rm -fr
            return child_process.exec(`rm -rf ${dir}`, cb);
        }else{
            return rimraf(dir, cb);
        }
    },

    // JSON helper for responses
    json: (res, json) => {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(json));
    },

    sanitize: function(filePath){
        return filePath.replace(/(\/|\\)/g, "_");
    },

    sleep: async function(msecs){
        return new Promise((resolve) => setTimeout(resolve, msecs));
    },

    clone: function(json){
        return JSON.parse(JSON.stringify(json));
    },

    chunkArray: function(arr, chunk_size){
        var index = 0;
        var arrayLength = arr.length;
        var tempArray = [];
        
        for (index = 0; index < arrayLength; index += chunk_size) {
            let myChunk = arr.slice(index, index+chunk_size);
            tempArray.push(myChunk);
        }
    
        return tempArray;
    }
};
