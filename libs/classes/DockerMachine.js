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

runningProcesses = {};

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
                    }else reject(new Error("Docker-machine does not seem to work. Please make sure docker-machine is working."));                })
                .on('error', () => reject(new Error("Docker-machine not found in PATH. Please install docker-machine if you want to use the autoscaler.")));
            childProcess        
        });
    },

    Class: class DockerMachine{
        constructor(machineName){
            this.machineName = machineName;
        }

        async run(args){
            logger.debug("Running: docker-machine " + args.join(" "));

            return new Promise((resolve, reject) => {
                const childProcess = spawn("docker-machine", args);
                runningProcesses[this.machineName] = runningProcesses[this.machineName] || [];
                runningProcesses[this.machineName].push(childProcess);

                const cleanup = () => {
                    runningProcesses[this.machineName] = runningProcesses[this.machineName].filter(p => p !== childProcess);
                    if (runningProcesses[this.machineName].length === 0) delete(runningProcesses[this.machineName]);
                };
                const output = [];

                childProcess
                    .on('exit', (code, _) => {
                        cleanup();
                        if (code === 0) resolve(output.join("\n"));
                        else reject(new Error(`docker-machine exited with code ${code}`));
                    })
                    .on('error', () => {
                        cleanup();
                        reject(new Error("Docker-machine not found in PATH. Please install docker-machine if you want to use the autoscaler."))
                    });
                
                const processOutput = chunk => {
                    const line = chunk.toString().trim();
                    logger.debug(line);
                    output.push(line);
                };
                childProcess.stdout.on('data', processOutput);
                childProcess.stderr.on('data', processOutput);
            });
        }

        async create(args){
            return this.run(["create"].concat(args).concat([this.machineName]));
        }

        async inspect(){
            let output = "";
            try{
                output = await this.run(["inspect", this.machineName]);
                return JSON.parse(output);
            }catch(e){
                logger.warn(`Cannot parse output of inspect: ${output}`);
                return {};
            }
        }

        async ssh(command){
            return this.run(['ssh', this.machineName, command]);
        }

        async getIP(){
            const info = await this.inspect();
            if (info && info.Driver && info.Driver.IPAddress){
                return info.Driver.IPAddress;
            }else{
                throw new Error(`Cannot get IP for machine: ${this.machineName}`);
            }
        }

        async rm(force){
            const args = ["rm", "-y"];
            if (force) args.push("-f");
            args.push(this.machineName);

            return this.run(args);
        }
    }
}

