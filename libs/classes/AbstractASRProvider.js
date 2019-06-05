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

        this.nodesPendingCreation = 0;
    }

    getDriverName(){
        throw new Error("Not implemented");
    }

    async getCreateArgs(imagesCount){
        throw new Error("Not implemented");
    }

    canHandle(imagesCount){
        throw new Error("Not implemented");
    }

    getDownloadsBaseUrl(){
        throw new Error("Not implemented");
    }

    getServicePort(){
        return 3000;
    }

    getMachinesLimit(){
        return -1;
    }

    getCreateRetries(){
        1;
    }

    getMaxRuntime(){
        return -1;
    }

    getMaxUploadTime(){
        return -1;
    }

    getNodesPendingCreation(){
        return this.nodesPendingCreation;
    }

    validateConfigKeys(keys){
        for (let prop of keys){
            if (this.getConfig(prop) === "CHANGEME!" || this.getConfig(prop, undefined) === undefined) throw new Error(`You need to create a configuration file and set ${prop}.`);
        }
    }

    // Setup docker machine after creation
    // @param req {http.ClientRequest} request object from HttpProxy
    // @param token {String} user token
    // @param dm {DockerMachine} docker machine client
    // @param nodeToken {String} token to set to protect the new machine instance services
    async setupMachine(req, token, dm, nodeToken){
        // Override
    }

    // Spawn new nodes
    // @param req {http.ClientRequest} request object from HttpProxy
    // @param imagesCount {Number} number of images this node should be able to process
    // @param token {String} user token
    // @param hostname {String} docker-machine hostname
    // @return {Node} a new Node instance
    async createNode(req, imagesCount, token, hostname){
        if (!this.canHandle(imagesCount)) throw new Error(`Cannot handle ${imagesCount} images.`);

        const dm = new DockerMachine(hostname);
        const args = ["--driver", this.getDriverName()]
                        .concat(await this.getCreateArgs(imagesCount));
        const nodeToken = short.generate();

        try{
            this.nodesPendingCreation++;

            let created = false;
            for (let i = 1; i <= this.getCreateRetries(); i++){
                logger.info(`Trying to create machine... (${i})`);
                try{
                    await dm.create(args);
                    created = true;
                    break;
                }catch(e){
                    logger.warn(`Cannot create machine: ${e}`);
                    await utils.sleep(10000 * i);
                }
            }
            if (!created) throw new Error(`Cannot create machine (attempted ${this.getCreateRetries()} times)`);

            await this.setupMachine(req, token, dm, nodeToken);
            
            const node = new Node(await dm.getIP(), this.getServicePort(), nodeToken);
    
            // Wait for the node to get online
            for (let i = 1; i <= 5; i++){
                await node.updateInfo();
                if (node.isOnline()) break;
                logger.info(`Waiting for ${node} to get online... (${i})`);
                await utils.sleep(1000 * i);
            }
            if (!node.isOnline()) throw new Error("No nodes available (spawned a new node, but the node did not get online).");
    
            node.setDockerMachine(hostname, this.getMaxRuntime(), this.getMaxUploadTime());
            return node;
        }catch(e){
            try{
                dm.rm(); // Make sure to cleanup if something goes wrong!
            }catch(e){
                logger.warn("Could not remove docker-machine, it's likely that the machine was not created, but double-check!");
            }
            throw e;
        }finally{
            this.nodesPendingCreation--;
        }
    }

    async destroyNode(node){
        if (node.isAutoSpawned()){
            logger.debug(`Destroying ${node}`);
            return this.destroyMachine(node.getDockerMachineName());
        }else{
            // Should never happen
            logger.warn(`Tried to call destroyNode on a non-autospawned node: ${node}`);
        }
    }
    
    async destroyMachine(dmHostname){
        logger.debug(`About to destroy ${dmHostname}`);
        const dm = new DockerMachine(dmHostname);
        return dm.rm(true);
    }

    generateHostname(imagesCount){
        if (imagesCount === undefined) throw new Error("Images count missing");
        
        return `clusterodm-${imagesCount}-${short.generate()}`;
    }

    getConfig(key, defaultValue = ""){
        return utils.get(this.config, key, defaultValue);
    }
}