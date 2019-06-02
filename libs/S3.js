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
"use strict";
const AWS = require('aws-sdk');
const logger = require('./logger');

module.exports = {
    testBucket: async function(accessKey, secretKey, endpoint, bucket){
        return new Promise((resolve, reject) => {
            const spacesEndpoint = new AWS.Endpoint(endpoint);
            const s3 = new AWS.S3({
                endpoint: spacesEndpoint,
                signatureVersion: 'v4',
                accessKeyId: accessKey,
                secretAccessKey: secretKey
            });

            // Test connection
            s3.putObject({
                Bucket: bucket,
                Key: 'test.txt',
                Body: ''
            }, err => {
                if (!err){
                    logger.info("Can write to S3");
                    resolve(true);
                }else{
                    reject(new Error("Cannot connect to S3. Check your S3 configuration: " + err.code));
                }
            });
        });
    }
};
