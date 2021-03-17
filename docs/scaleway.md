# Installing the Scaleway Driver

Scaleway is an unofficial driver for docker-machine. This means you need to install the driver for scaleway separately before you can use it.

1. Download the latest version of the driver from https://github.com/scaleway/docker-machine-driver-scaleway/releases
2. Extract the binary and place it in your PATH. 

For example on Linux you can do:

```bash
wget https://github.com/scaleway/docker-machine-driver-scaleway/releases/download/v1.6/docker-machine-driver-scaleway_1.6_linux_amd64.tar.gz
tar -xvf docker-machine-driver-scaleway_1.6_linux_amd64.tar.gz
chmod +x docker-machine-driver-scaleway
sudo mv docker-machine-driver-scaleway /usr/local/bin
```

# Provider Configuration for Scaleway

Example configuration file:

```json
{
    "provider": "scaleway",
    "organization": "CHANGEME!",
    "secretToken": "CHANGEME!",

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
    "region": "par1",
    
    "image": "ubuntu-xenial",
    "engineInstallUrl": "https://releases.rancher.com/install-docker/19.03.9.sh",
    
    "imageSizeMapping": [
        {"maxImages": 5, "slug": "GP1-XS"},
        {"maxImages": 50, "slug": "GP1-S"}
    ],
    "minImages": -1,

    "addSwap": 1,
    "dockerImage": "opendronemap/nodeodm"
}
```

| Field                    | Description                                                                                                                                                                                                                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| organization             | Scaleway Organization ID                                                                                                                                                                                                                                                                                          |
| secretToken              | Scaleway Secret API Token (you can generate one from the Scaleway's dashboard)                                                                                                                                                                                                                                    |
| s3                       | S3 keys and bucket configuration                                                                                                                                                                                                                                                                                  |
| machinesLimit            | Maximum number of machines that are allowed to run at the same time. Set to -1 for no limit.                                                                                                                                                                                                                      |
| createRetries            | Number of attempts to create a machine before giving up. Defaults to 1.                                                                                                                                                                                                                                           |
| maxRuntime               | Maximum number of seconds a machine is allowed to run ever. Set to -1 for no limit.                                                                                                                                                                                                                               |
| maxUploadTime            | Maximum number of seconds a machine is allowed to receive file uploads. Set to -1 for no limit.                                                                                                                                                                                                                   |
| region                   | Region identifier where the machines should be created.                                                                                                                                                                                                                                                           |
| image                    | Image identifier or snapshot identifier                                                                                                                                                                                                                                                                           |
| imageSizeMapping         | Max images count to machine size mapping. The autoscaler will pick a machine size based on the number of images of the incoming task. Use this to control what size of machine should correspond to which image count. The least powerful machine able to process a certain number of images is always selected.) |
| minImages                | Minimum number of images that a dataset needs to have for the autoscaler to be used (-1 = no minimum).                                                                                                                                                                                                              |
| addSwap                  | Optionally add this much swap space to the machine as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM.                                                                                                                                                         |
| dockerImage              | Docker image to launch                                                                                                                                                                                                                                                                                            |

