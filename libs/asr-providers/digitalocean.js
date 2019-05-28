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
            "access-token": "CHANGEME!",

            "max-runtime": 172800,
            "region": "nyc3",
            "monitoring": true,
            "tags": ["clusterodm"],
            "image": "ubuntu-16-04-x64",
        
            "image-size-mapping": [
                {"max-images": 5, "slug": "s-1vcpu-1gb"},
                {"max-images": 50, "slug": "s-4vcpu-8gb"}
            ],
        
            "add_swap": 1
        }, userConfig);

        if (this.getConfig("access-token") === "CHANGEME!") throw new Error("You need to create a configuration file and set an access-token value.");
    }

    getDriverName(){
        return "digitalocean";
    }

    canHandle(imagesCount){
        return this.getImageSlugFor(imagesCount) !== null;
    }

    getImageSlugFor(imagesCount){
        // TODO: 
        return null;
    }

    getCreateArgs(imagesCount){
        const args = [
            "--digitalocean-access-token", this.getConfig("access-token"),
            "--digitalocean-region", this.getConfig("region"),
            "--digitalocean-image", this.getConfig("image"),
            "--digitalocean-size", this.getImageSlugFor(imagesCount)
        ];

        if (this.getConfig("monitoring")){
            args.push("--digitalocean-monitoring");
            args.push("true");
        }

        if (this.getConfig("tags", []).length > 0){
            args.push("--digitalocean-tags");
            args.push(this.getConfig("tags").join(","));
        }

        return args;
    }
};