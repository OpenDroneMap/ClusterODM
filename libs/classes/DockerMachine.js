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
const spawn = require('child_process').spawn;

module.exports = {
    // Raises an exception if docker-machine is not installed
    checkInstalled: async function(){
        const childProcess = spawn("docker-machine", ['--help']);
    
        return new Promise((resolve, reject) => {
            childProcess
                .on('exit', (code, signal) => {
                    if (code === 0){
                        logger.info("Found docker-machine executable");
                        resolve();
                    }else reject("Docker-machine does not seem to work. Please make sure docker-machine is working.");
                })
                .on('error', () => reject("Docker-machine not found in PATH. Please install docker-machine if you want to use the autoscaler."));
        });
    },

    Class: class DockerMachine{
        constructor(machineName){
            this.machineName = machineName;
        }

        create(args){
            
        }
    }
}

