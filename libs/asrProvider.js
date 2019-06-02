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
const fs = require('fs');
const logger = require('./logger');
const nodes = require('./nodes');
const routetable = require('./routetable');
const netutils = require('./netutils');
const DockerMachine = require('./classes/DockerMachine');

// The autoscaler provides the ability to automatically spawn
// new VMs in the cloud to handle workloads when we run out of existing nodes
let asrProvider = null;

module.exports = {
    initialize: async function(userConfig){
        if (!userConfig) return;

        try{
            const { provider } = JSON.parse(fs.readFileSync(userConfig, {encoding: 'utf8'}));
            if (provider){
                asrProvider = new (require('./asr-providers/' + provider + '.js'))(userConfig);
                await asrProvider.initialize();
                await DockerMachine.checkInstalled();
            }else{
                throw new Error("Your ASR configuration must specify a provider key (we didn't find it).");
            }
        }catch(e){
            logger.error(`Cannot initialize ASR: ${e.message}`);
            process.exit(1);
        }

        setInterval(this.vacuum.bind(this), 1000 * 60 * 10);
        this.vacuum();

        return asrProvider;
    },

    get: function(){
        return asrProvider;
    },

    cleanup: async function(taskId, delay = 0){
        const asr = this.get();
        if (asr){
            const node = await routetable.lookupNode(taskId);
            if (node && node.isAutoSpawned()){
                const run = () => {
                    netutils.removeAndCleanupNode(node);
                };

                logger.debug(`ASR cleanup (delay: ${delay})`);
                if (delay) setTimeout(run, delay);
                else run();
            }
        }
    },

    vacuum: async function(){
        const autoNodes = nodes.find(n => n.isAutoSpawned() && n.isOnline());
        if (!autoNodes) return;
        
        // Automatically remove autospawned nodes if either:
        // - They have been online for too long (stuck?)
        // - They have an empty queue and are past their allowed upload time

        const now = new Date().getTime();
        const cleanNodes = [];

        autoNodes.forEach(n => {
            if (n.getDockerMachineMaxRuntime() > 0 && (now - n.getDockerMachineCreated()) > n.getDockerMachineMaxRuntime() * 1000){
                logger.warn(`${n} has exceeded its maximum runtime and will be forcibly deleted!`)
                cleanNodes.push(n);
            }else{
                if (n.getDockerMachineMaxUploadTime() > 0 &&
                    n.getInfoProperty("taskQueueCount", 0) === 0 && 
                    (now - n.getDockerMachineCreated()) > n.getDockerMachineMaxUploadTime() * 1000){
                    logger.warn(`${n} has exceeded its maximum upload time and will be forcibly deleted!`)
                    cleanNodes.push(n);
                }
            }
        });

        cleanNodes.forEach(n => {
            netutils.removeAndCleanupNode(n);
        });
    }
}