# Provider Configuration for Amazon Web Services

In order to use ClusterODM with AWS:

* Create an Amazon Web Services Account
* Select a region to run your instances in - `us-east-2` typically has the cheapest instance costs.
* Note the zone selected for the region, e.g. 'a'.  This will appear appended to the region in 'availability zone'.
* Select/Create a VPC in which the resources will operate.
* Select/Create a subnet within the VPC.
* Create a security group in this region, VPC, and subnet which allows inbound access from your ClusterODM master instance on TCP port 3000. Note the name of the security group not the ID.
* Create an S3 bucket in this region to handle results. Don't configure this bucket to block public access.
* Select an AMI (machine image) to run - Ubuntu has a [handy AMI finder](https://cloud-images.ubuntu.com/locator/ec2/).
* Create an IAM account for ClusterODM to use, which has EC2 and S3 permissions.
* Create a ClusterODM configuration json file as below.

To optimise transfer speeds in large jobs, it's worth running ClusterODM in the same AWS region as your worker nodes.

## Using Spot Instances

This provider supports requesting [EC2 spot instances](https://aws.amazon.com/ec2/spot/). Spot instances can save up to 90% of costs compared to
normal on-demand instance costs which makes AWS very competitive with other cloud providers. Spot instances are reliable enough
for long-running ODM jobs if the spot bid price is set high enough. It's common to request a bid price the same as
the on-demand instance cost - you'll always pay the current market price, not your bid price.

## Configuration File
```json
{
    "provider": "aws",
    
    "accessKey": "CHANGEME!",
    "secretKey": "CHANGEME!",
    "s3":{
        "endpoint": "s3.us-west-2.amazonaws.com",
        "bucket": "bucketname"
    },
    "vpc": "",
    "subnet": "",
    "securityGroup": "CHANGEME!",

    "monitoring": false,
    "maxRuntime": -1,
    "maxUploadTime": -1,
    "region": "us-west-2",
    "zone": "a",
    "tags": ["type,clusterodm"],
    
    "ami": "ami-07b4f3c02c7f83d59",
    "engineInstallUrl": "\"https://releases.rancher.com/install-docker/19.03.9.sh\"",
    
    "spot": true,
    "imageSizeMapping": [
        {"maxImages": 40, "slug": "t3a.small", "spotPrice": 0.02, "storage": 60},
        {"maxImages": 80, "slug": "t3a.medium", "spotPrice": 0.04, "storage": 100},
        {"maxImages": 250, "slug": "m5.large", "spotPrice": 0.1, "storage": 160},
        {"maxImages": 500, "slug": "m5.xlarge", "spotPrice": 0.2, "storage": 320},
        {"maxImages": 1500, "slug": "m5.2xlarge", "spotPrice": 0.4, "storage": 640},
        {"maxImages": 2500, "slug": "r5.2xlarge", "spotPrice": 0.6, "storage": 1200},
        {"maxImages": 3500, "slug": "r5.4xlarge", "spotPrice": 1.1, "storage": 2000},
        {"maxImages": 5000, "slug": "r5.4xlarge", "spotPrice": 1.1, "storage": 2500}
    ],

    "addSwap": 1,
    "dockerImage": "opendronemap/nodeodm"
}
```

| Field            | Description                                                                                                                                                |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| accessKey        | AWS Access Key                                                                                                                                             |
| secretKey        | AWS Secret Key                                                                                                                                             |
| s3               | S3 bucket configuration. Note that the bucket should *not* be configured to block public access.                                                           |
| vpc              | The virtual private cloud in which the instances operate. Not providing this assumes a default setting for VPC within the AWS environment.                 |
| subnet           | The subnet supporting the instances.  Not providing this assumes a default setting for the subnet within the AWS environment.                              |
| securityGroup    | AWS Security Group name (not ID). Must exist and allow incoming connections from your ClusterODM host on port TCP/3000.                                    |
| createRetries    | Number of attempts to create a droplet before giving up. Defaults to 1.                                                                                    |
| maxRuntime       | Maximum number of seconds an instance is allowed to run ever. Set to -1 for no limit.                                                                      |
| maxUploadTime    | Maximum number of seconds an instance is allowed to receive file uploads. Set to -1 for no limit.                                                          |
| monitoring       | Set to true to enable detailed Cloudwatch monitoring for the instance.                                                                                     |
| region           | Region identifier where the instances should be created.                                                                                                   |
| zone		   | Zone identifier where the instances should be created.                                                                                                     |
| ami              | The AMI (machine image) to launch this instance from.                                                                                                      |
| tags             | Comma-separated list of key,value tags to associate to the instance.                                                                                       |
| spot             | Whether to request spot instances. If this is true, a `spotPrice` needs to be provided in the `imageSizeMapping`.                                          |
| imageSizeMapping | Max images count to instance size mapping. (See below.)                                                                                                    |
| addSwap          | Optionally add this much swap space to the instance as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM. |
| dockerImage      | Docker image to launch                                                                                                                                     |

## Image Size Mapping

The `imageSizeMapping` dictionary dictates the instance parameters which will be requested by ClusterODM based on the number of images in the incoming task. The least powerful
instance able to process the requested number of images is always selected.

[EC2Instances.info](https://www.ec2instances.info) is a useful resource to help in selecting the appropriate instance type.

| Field     | Description                                                                                       |
|-----------|---------------------------------------------------------------------------------------------------|
| maxImages | The maximum number of images this instance size can handle.                                       |
| slug      | EC2 instance type to request (for example, `t3.medium`).                                          |
| storage   | Amount of storage to allocate to this instance's EBS root volume, in GB.                          |
| spotPrice | The maximum hourly price you're willing to bid for this instance (if spot instances are enabled). |