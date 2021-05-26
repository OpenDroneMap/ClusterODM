# Installing the Hetzner Driver

Hetzner is an unofficial driver for docker-machine. This means you need to install the driver for hetzner separately before you can use it.

1. Download the latest version of the driver from https://github.com/JonasProgrammer/docker-machine-driver-hetzner/releases
2. Extract the binary and place it in your PATH.

For example on Linux you can do:

```bash
wget wget https://github.com/JonasProgrammer/docker-machine-driver-hetzner/releases/download/2.0.1/docker-machine-driver-hetzner_2.0.1_linux_amd64.tar.gz
tar -xvf docker-machine-driver-hetzner_2.0.1_linux_amd64.tar.gz
chmod +x docker-machine-driver-hetzner
sudo mv docker-machine-driver-hetzner /usr/local/bin
```

# Provider Configuration for Hetzner

Example configuration file:

```json
{
    "provider": "hetzner",
    "apiToken": "CHANGEME!",
    "s3": {
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
    "engineInstallUrl": "\"https://releases.rancher.com/install-docker/19.03.9.sh\"",

    "sshKey": {
        "fingerprint": "",
        "path": ""
    },

    "imageSizeMapping": [
        {"maxImages": 5, "slug": "cx11"},
        {"maxImages": 50, "slug": "cx21"}
    ],
    "minImages": -1,

    "addSwap": 1,
    "dockerImage": "opendronemap/nodeodm"
}
```

| Field            | Description                                                                                                                                                                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apiToken         | Hetzner API Token                                                                                                                                                                                                                                                                                                |
| s3               | S3 keys and bucket configuration                                                                                                                                                                                                                                                                                 |
| machinesLimit    | Maximum number of machines that are allowed to run at the same time. Set to -1 for no limit.                                                                                                                                                                                                                     |
| createRetries    | Number of attempts to create a machine before giving up. Defaults to 1.                                                                                                                                                                                                                                          |
| maxRuntime       | Maximum number of seconds a machine is allowed to run ever. Set to -1 for no limit.                                                                                                                                                                                                                              |
| maxUploadTime    | Maximum number of seconds a machine is allowed to receive file uploads. Set to -1 for no limit.                                                                                                                                                                                                                  |
| location         | Location identifier where the machines should be created.                                                                                                                                                                                                                                                        |
| image            | Image identifier (from public images) or snapshot identifier (private) if snapshot is set to `true` (see below).                                                                                                                                                                                                 |
| snapshot         | When set to `true`, `image` refers to a snapshot in the user account instead of an image name. Useful to speed up boot time if you already have a machine with the docker image preloaded.                                                                                                                       |
| sshKey           | Optionally specify an existing Hetzner SSH `fingerprint` and private key `path` instead of generating new keys.                                                                                                                                                                                                  |
| imageSizeMapping | Max images count to machine size mapping. The autoscaler will pick a machine size based on the number of images of the incoming task. Use this to control what size of machine should correspond to which image count. The least powerful machine able to process a certain number of images is always selected. |
| minImages        | Minimum number of images that a dataset needs to have for the autoscaler to be used (-1 = no minimum).                                                                                                                                                                                                           |
| addSwap          | Optionally add this much swap space to the machine as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM.                                                                                                                                                        |
| dockerImage      | Docker image to launch                                                                                                                                                                                                                                                                                           |
