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
const axios = require('axios');
const logger = require('../logger');
const fs = require('fs');

module.exports = class DigitalOceanAsrProvider extends AbstractASRProvider{
    constructor(userConfig){
        super({
            "accessToken": "CHANGEME!",
            "s3":{
                "accessKey": "CHANGEME!",
                "secretKey": "CHANGEME!",
                "endpoint": "CHANGEME!",
                "bucket": "CHANGEME!",
                "ignoreSSL": false
            },

            "maxRuntime": -1,
            "maxUploadTime": -1,
            "dropletsLimit": -1,
            "createRetries": 1,
            "region": "nyc3",
            "monitoring": true,
            "tags": ["clusterodm"],
            
            "image": "ubuntu-16-04-x64",
            "snapshot": false,

            "sshKey":{
                "fingerprint": "",
                "path": "",
            },

            "imageSizeMapping": [
                {"maxImages": 5, "slug": "s-1vcpu-1gb"},
                {"maxImages": 50, "slug": "s-4vcpu-8gb"}
            ],
            "minImages": -1,

            "addSwap": 1,
            "dockerImage": "opendronemap/nodeodm",
            "dockerAdditionalArgs": ""
        }, userConfig);
    }

    async initialize(){
        this.validateConfigKeys(["accessToken", "s3.accessKey", "s3.secretKey", "s3.endpoint", "s3.bucket", "s3.ignoreSSL"]);

        // Test S3
        const { accessKey, secretKey, endpoint, bucket, ignoreSSL } = this.getConfig("s3");
        await S3.testBucket(accessKey, secretKey, endpoint, bucket, ignoreSSL);
        
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
        return "digitalocean";
    }

    getMachinesLimit(){
        return this.getConfig("dropletsLimit", -1);
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
        const dockerAdditionalArgs = this.getConfig("dockerAdditionalArgs", "");
        const s3 = this.getConfig("s3");
        const webhook = netutils.publicAddressPath("/commit", req, token);

        await dm.ssh([`docker run -d -p 3000:3000 ${dockerImage} -q 1`,
                     `--s3_access_key ${s3.accessKey}`,
                     `--s3_secret_key ${s3.secretKey}`,
                     `--s3_endpoint ${s3.endpoint}`,
                     `--s3_bucket ${s3.bucket}`,
                     s3.ignoreSSL ? '--s3_ignore_ssl' : '',
                     `--webhook ${webhook}`,
                     `--token ${nodeToken}`,
                    `${dockerAdditionalArgs}`].join(" "));
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

    async getImageInfo(){
        let imageName = this.getConfig("image");
        let imageRegion = this.getConfig("region");

        if (this.getConfig("snapshot")){
            // We need to fetch the imageID
            const response = await axios.get("https://api.digitalocean.com/v2/images?page=1&per_page=9999999&private=true", { 
                timeout: 10000,
                headers: {
                    Authorization: `Bearer ${this.getConfig("accessToken")}`
                }
            });

            if (response.status === 200){
                const { images } = response.data;
                const img = images.find(img => img.name === imageName);
                if (img && img.id && img.regions){
                    // Check that the snapshot is available in our preferred region
                    if (img.regions.indexOf(imageRegion) === -1){
                        if (img.regions.length > 0){
                            const newRegion = img.regions[0];
                            logger.warn(`The snapshot ${imageName} is not available in the ${imageRegion}, switching to ${newRegion}`);
                            imageRegion = newRegion;
                        }else{
                            // Can this ever happen?
                            throw new Error(`Snapshot found, but not available in any region.`);
                        }
                    }

                    imageName = img.id;
                }else{
                    throw new Error(`Snapshot ${imageName} not found.`);
                }
            }else{
                throw new Error(`Cannot contact DigitalOcean API: ${response.status}`);
            }
        }

        return {
            image: imageName,
            region: imageRegion
        };
    }

    async getCreateArgs(imagesCount){
        const imageInfo = await this.getImageInfo();

        const args = [
            "--digitalocean-access-token", this.getConfig("accessToken"),
            "--digitalocean-region", imageInfo.region,
            "--digitalocean-image", imageInfo.image,
            "--digitalocean-size", this.getImageSlugFor(imagesCount)
        ];

        if (this.getConfig("monitoring")){
            args.push("--digitalocean-monitoring=true");
        }

        if (this.getConfig("tags", []).length > 0){
            args.push("--digitalocean-tags");
            args.push(this.getConfig("tags").join(","));
        }

        if (this.getConfig("sshKey.fingerprint", "")){
            args.push("--digitalocean-ssh-key-fingerprint");
            args.push(this.getConfig("sshKey.fingerprint"));
        }

        if (this.getConfig("sshKey.path", "")){
            args.push("--digitalocean-ssh-key-path");
            args.push(this.getConfig("sshKey.path"));
        }

        if (this.getConfig("engineInstallUrl")){
            args.push("--engine-install-url")
            args.push(this.getConfig("engineInstallUrl"));
        }

        return args;
    }
};