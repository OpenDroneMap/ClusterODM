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
const AbstractASRProvider = require('../classes/AbstractASRProvider');
const netutils = require('../netutils');
const S3 = require('../S3');
const logger = require('../logger');
const fs = require('fs');

module.exports = class AWSAsrProvider extends AbstractASRProvider{
    constructor(userConfig){
        super({
            "accessKey": "CHANGEME!",
            "secretKey": "CHANGEME!",
            "s3":{
                "endpoint": "CHANGEME!",
                "bucket": "CHANGEME!",
                "acl": "public-read"
            },
            "vpc": "",
            "subnet": "",
            "usePrivateAddress": false,
            "assignPrivateAddressOnly": false,
            "securityGroup": "CHANGEME!",
            "maxRuntime": -1,
            "maxUploadTime": -1,
            "instanceLimit": -1,
            "createRetries": 1,
            "region": "us-west-2",
            "zone": "",
            "monitoring": false,
            "tags": ["clusterodm"],
            "ami": "ami-07b4f3c02c7f83d59",
            "spot": false,
            "imageSizeMapping": [
                {"maxImages": 5, "slug": "t2.micro", "spotPrice": 0.1, "storage": 10},
                {"maxImages": 50, "slug": "t2.medium", "spotPrice": 0.1, "storage": 100}
            ],

            "addSwap": 1,
            "dockerImage": "opendronemap/nodeodm",
            "dockerDataDirMountPath": "",
            "dockerGpu": false,

            "iamrole": "",
            "nodeSetupCmd": ""
        }, userConfig);
    }

    async initialize(){
        this.validateConfigKeys(["accessKey", "secretKey", "s3.endpoint", "s3.bucket", "s3.acl", "securityGroup"]);

        // Test S3
        const { endpoint, bucket } = this.getConfig("s3");
        await S3.testBucket(this.getConfig("accessKey"), this.getConfig("secretKey"), endpoint, bucket);
        
        const im = this.getConfig("imageSizeMapping", []);
        if (!Array.isArray(im)) throw new Error("Invalid config key imageSizeMapping (array expected)");

        // Sort by ascending maxImages
        im.sort((a, b) => {
            if (a['maxImages'] < b['maxImages']) return -1;
            else if (a['maxImages'] > b['maxImages']) return 1;
            else return 0;
        });

        // Validate key path
        const sshKeyPath = this.getConfig("sshKey.path", "");
        if (sshKeyPath){
            logger.info("Using existing SSH key");
            const exists = await new Promise((resolve) => fs.exists(this.getConfig("sshKey.path"), resolve));
            if (!exists) throw new Error("Invalid config key sshKey.path: file does not exist");
        }
    }

    getDriverName(){
        return "amazonec2";
    }

    getMachinesLimit(){
        return this.getConfig("instanceLimit", -1);
    }

    getCreateRetries(){
        return this.getConfig("createRetries", 1);
    }
    
    getDownloadsBaseUrl(){
        return `https://${this.getConfig("s3.bucket")}.${this.getConfig("s3.endpoint")}`;
    }

    canHandle(imagesCount){
        return this.getImagePropertiesFor(imagesCount) !== null;
    }

    async setupMachine(req, token, dm, nodeToken){
        // Add swap proportional to the available RAM
        const swapToMemRatio = this.getConfig("addSwap");
        if (swapToMemRatio){
            const sshOutput = await dm.ssh(`bash -c "echo \\$(awk '/MemTotal/ { printf \\\"%d\\n\\\", \\$2 }' /proc/meminfo)"`)
            const memory = parseFloat(sshOutput.trim());
            if (!isNaN(memory)){
                await dm.ssh(`bash -c "sudo fallocate -l ${Math.ceil(memory * swapToMemRatio * 1024)} /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && free -h"`)
            }else{
                throw new Error(`Failed to allocate swap: ${sshOutput}`);
            }
        }

        const dockerImage = this.getConfig("dockerImage");
        const accessKey = this.getConfig("accessKey");
        const secretKey = this.getConfig("secretKey");
        const dataDirMountPath = this.getConfig("dataDirMountPath");
        const s3 = this.getConfig("s3");
        const webhook = netutils.publicAddressPath("/commit", req, token);
        
        const setupCmd = this.getConfig("nodeSetupCmd");
        if (setupCmd != null && setupCmd.length > 0)
        {
          await dm.ssh(setupCmd);
        }

        let dockerRunArgs = [`sudo docker run -d -p 3000:3000`];

    if(dataDirMountPath.length > 0){
        dockerRunArgs.push(`--mount type=bind,source=${dataDirMountPath},target=/var/www/data`);
    }
    if (this.getConfig("dockerGpu")){
        dockerRunArgs.push(`--gpus all`);
    }
        
    dockerRunArgs.push(`${dockerImage} -q 1`);
    dockerRunArgs.push(`--s3_access_key ${accessKey}`);
    dockerRunArgs.push(`--s3_secret_key ${secretKey}`);
    dockerRunArgs.push(`--s3_endpoint ${s3.endpoint}`);
    dockerRunArgs.push(`--s3_bucket ${s3.bucket}`);
    dockerRunArgs.push(`--s3_acl ${s3.acl}`);
    dockerRunArgs.push(`--webhook ${webhook}`);
    dockerRunArgs.push(`--token ${nodeToken}`);
        
    await dm.ssh(dockerRunArgs.join(" "));
    }

    getImagePropertiesFor(imagesCount){
        const im = this.getConfig("imageSizeMapping");

        let props = null;
        for (var k in im){
            const mapping = im[k];
            if (mapping['maxImages'] >= imagesCount){
                props = mapping;
                break;
            }
        }

        return props;
    }

    getMaxRuntime(){
        return this.getConfig("maxRuntime");
    }

    getMaxUploadTime(){
        return this.getConfig("maxUploadTime");
    }

    async getCreateArgs(imagesCount, attempt){
        const image_props = this.getImagePropertiesFor(imagesCount);
        const args = [
            "--amazonec2-access-key", this.getConfig("accessKey"),
            "--amazonec2-secret-key", this.getConfig("secretKey"),
            "--amazonec2-region", this.getConfigArrayItem("region", attempt - 1),
            "--amazonec2-ami", this.getConfig("ami"),
            "--amazonec2-instance-type", image_props["slug"],
            "--amazonec2-root-size", image_props["storage"],
            "--amazonec2-security-group", this.getConfig("securityGroup")
        ];

        if (this.getConfig("monitoring")) {
            args.push("--amazonec2-monitoring");
        }

        if (this.getConfig("spot")) {
            args.push("--amazonec2-request-spot-instance");
            args.push("--amazonec2-spot-price");
            args.push(image_props["spotPrice"]);
        }

        if (this.getConfig("tags", []).length > 0){
            args.push("--amazonec2-tags");
            args.push(this.getConfig("tags").join(","));
        }

        if (this.getConfig("usePrivateAddress")) {
            args.push("--amazonec2-use-private-address");
            if(this.getConfig("assignPrivateAddressOnly")) {
                args.push("--amazonec2-private-address-only");
            }
        }

        if (this.getConfig("engineInstallUrl")){
            args.push("--engine-install-url")
            args.push(this.getConfig("engineInstallUrl"));
        }

        if (this.getConfig("zone").length > 0){
            args.push("--amazonec2-zone")
            args.push(this.getConfig("zone"));
        }

        if (this.getConfig("vpc").length > 0){
            args.push("--amazonec2-vpc-id")
            args.push(this.getConfig("vpc"));
        }

        if (this.getConfig("subnet").length > 0){
            args.push("--amazonec2-subnet-id")
            args.push(this.getConfig("subnet"));
        }

        if (this.getConfig("iamrole").length > 0){
            args.push("--amazonec2-iam-instance-profile")
            args.push(this.getConfig("iamrole"));
        }

        return args;
    }

    getFailureSleepTime(attempt){
        const numRegions = this.getConfigArray("region").length;
        if (attempt <= numRegions) return 1000;
        else return 10000 * (attempt - numRegions);
    }
};
