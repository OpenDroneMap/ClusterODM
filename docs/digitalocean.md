# Provider Configuration for DigitalOcean

Example configuration file:

```json
{
    "provider": "digitalocean",
    
    "accessToken": "CHANGEME!",
    "s3":{
        "accessKey": "CHANGEME!",
        "secretKey": "CHANGEME!",
        "endpoint": "nyc3.digitaloceanspaces.com",
        "bucket": "bucketname"
    },

    "maxRuntime": -1,
    "maxUploadTime": -1,
    "region": "nyc3",
    "monitoring": true,
    "tags": ["clusterodm"],
    
    "image": "ubuntu-16-04-x64",
    "snapshot": false,

    "imageSizeMapping": [
        {"maxImages": 20, "slug": "s-1vcpu-1gb"},
        {"maxImages": 100, "slug": "s-4vcpu-8gb"}
    ],

    "addSwap": 1,
    "dockerImage": "opendronemap/nodeodm"
}
```

| Field                    | Description                                                                                                                                                                                                                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| accessToken              | DigitalOcean API Access Token                                                                                                                                                                                                                                                                                     |
| s3                       | S3 keys and bucket configuration                                                                                                                                                                                                                                                                                  |
| dropletsLimit            | Maximum number of droplets that are allowed to run at the same time. Set to -1 for no limit.                                                                                                                                                                                                                      |
| createRetries            | Number of attempts to create a droplet before giving up. Defaults to 1.
| maxRuntime               | Maximum number of seconds a droplet is allowed to run ever. Set to -1 for no limit.                                                                                                                                                                                                                               |
| maxUploadTime            | Maximum number of seconds a droplet is allowed to receive file uploads. Set to -1 for no limit.                                                                                                                                                                                                                   |
| region                   | Region identifier where the droplets should be created.                                                                                                                                                                                                                                                           |
| monitoring               | Set to true to enable monitoring on the droplet.                                                                                                                                                                                                                                                                  |
| tags                     | List of tags to associate to the droplet.                                                                                                                                                                                                                                                                         |
| image                    | Image identifier (from public images) or snapshot identifier (private) if snapshot is set to `true` (see below).                                                                                                                                                                                                  |
| snapshot                 | When set to `true`, `image` refers to a snapshot in the user account instead of an image name. Useful to speed up boot time if you already have a droplet with the docker image preloaded.                                                                                                                        |
| sshKey                   | Optionally specify an existing DigitalOcean SSH `fingerprint` and private key `path` instead of generating new keys.
| imageSizeMapping         | Max images count to droplet size mapping. The autoscaler will pick a droplet size based on the number of images of the incoming task. Use this to control what size of droplet should correspond to which image count. The least powerful droplet able to process a certain number of images is always selected. Valid slug identifiers are available from [Digital Ocean's API list all sizes](https://developers.digitalocean.com/documentation/v2/#list-all-sizes) |
| addSwap                  | Optionally add this much swap space to the droplet as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM.                                                                                                                                                         |
| dockerImage              | Docker image to launch                                                                                                        
                                                                                                                                                                                    |
