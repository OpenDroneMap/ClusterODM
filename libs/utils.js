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
const logger = require('./logger');
const Readable = require('stream').Readable;
const rimraf = require('rimraf');

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
                                    rimraf(`tmp/${entry}`, cb);
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
    },

     // min and max included
    randomIntFromInterval: function(min,max){
        return Math.floor(Math.random()*(max-min+1)+min);
    },

    rmdir: function(dir){
        fs.exists(dir, exists => {
            if (exists){
                rimraf(dir, err => {
                    if (err) logger.warn(`Cannot delete ${dir}: ${err}`);
                });
            }
        });
    },

    // JSON helper for responses
    json: (res, json) => {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(json));
    },

    sanitize: function(filePath){
        return filePath.replace(/(\/|\\)/g, "_");
    }
};