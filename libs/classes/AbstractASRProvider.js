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
const logger = require('../logger');
const fs = require('fs');
const DockerMachine = require('./DockerMachine').Class;
const short = require('short-uuid');

module.exports = class AbstractASRProvider{
    constructor(defaults, userConfigFile){
        logger.info(`ASR: ${this.constructor.name}`);
        
        this.config = defaults;

        if (userConfigFile){
            try{
                const userConfig = JSON.parse(fs.readFileSync(userConfigFile).toString());
                for (let k in userConfig){
                    this.config[k] = userConfig[k];
                }
            }catch(e){
                throw new Error(`Invalid configuration file ${userConfigFile}`);
            }
        }
    }

    getDriverName(){
        throw new Error("Not implemented");
    }

    getCreateArgs(imagesCount){
        throw new Error("Not implemented");
    }

    canHandle(imagesCount){
        throw new Error("Not implemented");
    }

    // Spawn new nodes
    // @param imagesCount {Number} number of images this node should be able to process
    // @return {Node} a new Node instance
    async createNode(imagesCount){
        if (!this.canHandle(imagesCount)) throw new Error(`Cannot handle ${imagesCount} images.`);

        const hostname = this.generateHostname();
        const dm = new DockerMachine(hostname);
        const args = ["--driver", this.getDriverName()]
                        .concat(this.getCreateArgs(imagesCount));
        await dm.create(args);



        // TODO: create node instance
        console.log("TODO: Early exit");
        process.exit(1);
    }

    generateHostname(){
        return `clusterodm-${short.generate()}`;
    }

    getConfig(key, defaultValue = ""){
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
    
}