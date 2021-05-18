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
const axios = require('axios');
const fs = require('fs');

module.exports = class HetznerAsrProvider extends AbstractASRProvider{
    constructor(userConfig){
        super({
            "apiToken": "CHANGEME!",
            "s3":{
                "accessKey": "CHANGEME!",
                "secretKey": "CHANGEME!",
                "endpoint": "CHANGEME!",
                "bucket": "CHANGEME!"
            },

            "maxRuntime": -1,
            "maxUploadTime": -1,
            "machinesLimit": -1,
            "createRetries": 1,
            "location": "fsn1",
            
            "image": "ubuntu-18.04",
            "snapshot": false,

            "sshKey":{
                "fingerprint": "",
                "path": "",
            },

            "imageSizeMapping": [
                {"maxImages": 5, "slug": "cx11"},
                {"maxImages": 50, "slug": "cx21"}
            ],
            "minImages": -1,

            "addSwap": 1,
            "dockerImage": "opendronemap/nodeodm"
        }, userConfig);
    }

    async initialize(){
        this.validateConfigKeys(["apiToken", "image", "s3.accessKey", "s3.secretKey", "s3.endpoint", "s3.bucket"]);

        // Test S3
        const { accessKey, secretKey, endpoint, bucket } = this.getConfig("s3");
        await S3.testBucket(accessKey, secretKey, endpoint, bucket);
        
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

        this.fpCache = {};
    }

    getDriverName(){
        return "hetzner";
    }

    getMachinesLimit(){
        return this.getConfig("machinesLimit", -1);
    }

    getCreateRetries(){
        return this.getConfig("createRetries", 1);
    }
    
    getDownloadsBaseUrl(){
        return `https://${this.getConfig("s3.bucket")}.${this.getConfig("s3.endpoint")}`;
    }

    canHandle(imagesCount){
        const minImages = this.getConfig("minImages", -1);

        return this.getImageSlugFor(imagesCount) !== null && 
               (minImages === -1 || imagesCount >= minImages);
    }

    async getSSHKeyId(){
        const fingerprint = this.getConfig("sshKey.fingerprint");
        if (!fingerprint) throw new Error("Need to specify SSH Key fingerprint in configuration.");
        if (this.fpCache[fingerprint]) return this.fpCache[fingerprint];

        // We need to fetch the ssh key ID
        const response = await axios.get(`https://api.hetzner.cloud/v1/ssh_keys?page=1&per_page=9999999&fingerprint=${encodeURIComponent(fingerprint)}`, { 
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${this.getConfig("apiToken")}`
            }
        });

        if (response.status === 200){
            const { ssh_keys } = response.data;
            const key = ssh_keys.find(sk => sk.fingerprint === fingerprint);
            if (key && key.id){
                this.fpCache[fingerprint] = key.id;
                return key.id;
            }else{
                throw new Error(`SSH Key with fingerprint ${fingerprint} not found.`);
            }
        }else{
            throw new Error(`Cannot contact Hetzner API: ${response.status}`);
        }
    }

    async getSnapshotId(){
        let imageName = this.getConfig("image");

        // We need to fetch the imageID
        const response = await axios.get("https://api.hetzner.cloud/v1/images?type=snapshot&description=nodeodm-image&page=1&per_page=9999999", { 
            timeout: 10000,
            headers: {
                Authorization: `Bearer ${this.getConfig("apiToken")}`
            }
        });

        if (response.status === 200){
            const { images } = response.data;
            const img = images.find(img => img.description === imageName);
            if (img && img.id){
                return img.id;
            }else{
                throw new Error(`Snapshot ${imageName} not found.`);
            }
        }else{
            throw new Error(`Cannot contact Hetzner API: ${response.status}`);
        }
    }

    async setupMachine(req, token, dm, nodeToken){
        // Add swap proportional to the available RAM
        const swapToMemRatio = this.getConfig("addSwap");
        if (swapToMemRatio){
            const sshOutput = await dm.ssh(`bash -c "echo \\$(awk '/MemTotal/ { printf \\\"%d\\n\\\", \\$2 }' /proc/meminfo)"`)
            const memory = parseFloat(sshOutput.trim());
            if (!isNaN(memory)){
                await dm.ssh(`bash -c "fallocate -l ${Math.ceil(memory * swapToMemRatio * 1024)} /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && free -h"`)
            }else{
                throw new Error(`Failed to allocate swap: ${sshOutput}`);
            }
        }

        const dockerImage = this.getConfig("dockerImage");
        const s3 = this.getConfig("s3");
        const webhook = netutils.publicAddressPath("/commit", req, token);

        await dm.ssh([`docker run -d -p 3000:3000 ${dockerImage} -q 1`,
                     `--s3_access_key ${s3.accessKey}`,
                     `--s3_secret_key ${s3.secretKey}`,
                     `--s3_endpoint ${s3.endpoint}`,
                     `--s3_bucket ${s3.bucket}`,
                     `--webhook ${webhook}`,
                     `--token ${nodeToken}`].join(" "));
    }

    getImageSlugFor(imagesCount){
        const im = this.getConfig("imageSizeMapping");

        let slug = null;
        for (var k in im){
            const mapping = im[k];
            if (mapping['maxImages'] >= imagesCount){
                slug = mapping['slug'];
                break;
            }
        }

        return slug;
    }

    getMaxRuntime(){
        return this.getConfig("maxRuntime");
    }

    getMaxUploadTime(){
        return this.getConfig("maxUploadTime");
    }

    async getCreateArgs(imagesCount){
        const args = [
            "--hetzner-api-token", this.getConfig("apiToken"),
            "--hetzner-server-location", this.getConfig("location"),
            "--hetzner-server-type", this.getImageSlugFor(imagesCount)
        ];

        if (this.getConfig("snapshot")){
            args.push("--hetzner-image-id");
            args.push(await this.getSnapshotId());
        }else{
            args.push("--hetzner-image");
            args.push(this.getConfig("image"));
        }


        if (this.getConfig("sshKey.fingerprint", "")){
            args.push("--hetzner-existing-key-id");
            args.push(await this.getSSHKeyId());
        }

        if (this.getConfig("sshKey.path", "")){
            args.push("--hetzner-existing-key-path");
            args.push(this.getConfig("sshKey.path"));
        }

        if (this.getConfig("engineInstallUrl")){
            args.push("--engine-install-url")
            args.push(this.getConfig("engineInstallUrl"));
        }

        return args;
    }
};