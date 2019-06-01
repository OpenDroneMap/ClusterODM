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
const Node = require('./Node');
const utils = require('../utils');

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

    getServicePort(){
        return 3000;
    }

    async setupMachine(dm){
        // Override
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
        try{
            await dm.create(args);
            await this.setupMachine(dm);
            
            const node = new Node(await dm.getIP(), this.getServicePort());
    
            // Wait for the node to get online
            for (let i = 1; i <= 5; i++){
                await node.updateInfo();
                if (node.isOnline()) break;
                logger.info(`Waiting for ${node} to get online... (${i})`);
                await utils.sleep(1000 * i);
            }
            if (!node.isOnline()) throw new Error("No nodes available (spawned a new node, but the node did not get online).");
    
            node.setDockerMachineName(hostname);
            return node;
        }catch(e){
            dm.rm(); // Make sure to cleanup if something goes wrong!
            throw e;
        }
    }

    async destroyNode(node){
        if (node.isAutoSpawned()){
            const hostname = node.getDockerMachineName();
            logger.debug(`About to destroy ${hostname} (${node})`);
            const dm = new DockerMachine(node.getDockerMachineName());
            return dm.rm();
        }else{
            // Should never happen
            logger.warn(`Tried to call destroyNode on a non-autospawned node: ${node}`);
        }
    }

    generateHostname(){
        return `clusterodm-${short.generate()}`;
    }

    getConfig(key, defaultValue = ""){
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
    
}