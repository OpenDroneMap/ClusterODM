# Provider Configuration for Amazon Web Services

Example configuration file:

```json
{
    "provider": "aws",
    
    "accessKey": "CHANGEME!",
    "secretKey": "CHANGEME!",
    "s3":{
    	"endpoint": "s3.us-west-2.amazonaws.com",
        "bucket": "bucketname"
    },
    "securityGroup": "CHANGEME!",

    "maxRuntime": -1,
    "maxUploadTime": -1,
    "region": "us-west-2",
    "tags": ["type,clusterodm"],
    
    "image": "ami-07b4f3c02c7f83d59",

    "spot": true,
    "imageSizeMapping": [
        {"maxImages": 20, "slug": "t3.micro", "spotPrice": 0.1, "storage": 10},
        {"maxImages": 100, "slug": "t3.medium", "spotPrice": 0.1, "storage": 100}
    ],

    "addSwap": 1,
    "dockerImage": "opendronemap/nodeodm"
}
```

| Field                    | Description                                                                                                                                                                                                                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| accessKey              | AWS Access Key                                                                                                                                                                                                                                                                                     |
| secretKey              | AWS Secret Key                                                                                                                                                                                                                                                                                     |
| s3                       | S3 bucket configuration. Note that the bucket should *not* be configured to block public access.                                                                                                                                                                                                                                                                                  |

| securityGroup            | AWS Security Group name (not ID). Must exist and allow incoming connections on port TCP/3000                                                                                                                                                                                                                                                                                     |
| createRetries            | Number of attempts to create a droplet before giving up. Defaults to 1.
| maxRuntime               | Maximum number of seconds an instance is allowed to run ever. Set to -1 for no limit.                                                                                                                                                                                                                               |
| maxUploadTime            | Maximum number of seconds an instance is allowed to receive file uploads. Set to -1 for no limit.                                                                                                                                                                                                                   |
| region                   | Region identifier where the instances should be created.                                                                                                                                                                                                                                                           |
| tags                     | Comma-separated list of key,value tags to associate to the instance.                                                                                                                                                                                                                                                                         |
| image                    | AMI identifier                                                                                                                                                                                                  |
| spot                     | Whether to request spot instances. If this is true, a `spotPrice` needs to be provided in the `imageSizeMapping`.                                                                                                                                                                                                  |
| imageSizeMapping         | Max images count to instance size mapping. The autoscaler will pick an instance size based on the number of images of the incoming task. Use this to control what size of instance should correspond to which image count. The least powerful instance able to process a certain number of images is always selected. |
| addSwap                  | Optionally add this much swap space to the instance as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM.                                                                                                                                                         |
| dockerImage              | Docker image to launch
                                                                                                                                                                                    |
