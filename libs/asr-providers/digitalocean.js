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
const AbstractASRProvider = require('../classes/AbstractASRProvider');

module.exports = class DigitalOceanAsrProvider extends AbstractASRProvider{
    constructor(userConfig){
        super({
            "accessToken": "CHANGEME!",

            "maxRuntime": 172800,
            "region": "nyc3",
            "monitoring": true,
            "tags": ["clusterodm"],
            "image": "ubuntu-16-04-x64",

            "imageSizeMapping": [
                {"maxImages": 5, "slug": "s-1vcpu-1gb"},
                {"maxImages": 50, "slug": "s-4vcpu-8gb"}
            ],

            "addSwap": 1,
            "dockerImage": "opendronemap/nodeodm"
        }, userConfig);

        if (this.getConfig("accessToken") === "CHANGEME!") throw new Error("You need to create a configuration file and set an accessToken value.");

        const im = this.getConfig("imageSizeMapping", []);
        if (!Array.isArray(im)) throw new Error("Invalid config key imageSizeMapping (array expected)");

        // Sort by ascending maxImages
        im.sort((a, b) => {
            if (a['maxImages'] < b['maxImages']) return -1;
            else if (a['maxImages'] > b['maxImages']) return 1;
            else return 0;
        });
    }

    getDriverName(){
        return "digitalocean";
    }

    canHandle(imagesCount){
        return this.getImageSlugFor(imagesCount) !== null;
    }

    async setupMachine(dm){
        // Add swap proportional to the available RAM
        const swapToMemRatio = this.getConfig("addSwap");
        if (swapToMemRatio){
            await dm.ssh(`bash -c "fallocate -l \\$(expr \\$(awk '/MemTotal/ { printf \\\"%d\\n\\\", \\$2 }' /proc/meminfo) * ${swapToMemRatio}) /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && free -h"`);
        }

        const dockerImage = this.getConfig("dockerImage");
        if (dockerImage){
            // TODO: pass S3 configurations
            // TODO: pass webhook
            await dm.ssh(`docker run -d -p 3000:3000 ${dockerImage} -q 1`);
        }
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

    getCreateArgs(imagesCount){
        const args = [
            "--digitalocean-access-token", this.getConfig("accessToken"),
            "--digitalocean-region", this.getConfig("region"),
            "--digitalocean-image", this.getConfig("image"),
            "--digitalocean-size", this.getImageSlugFor(imagesCount)
        ];

        if (this.getConfig("monitoring")){
            args.push("--digitalocean-monitoring=true");
        }

        if (this.getConfig("tags", []).length > 0){
            args.push("--digitalocean-tags");
            args.push(this.getConfig("tags").join(","));
        }

        return args;
    }
};