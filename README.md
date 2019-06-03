# ClusterODM

A reverse proxy, load balancer and task tracker with optional cloud autoscaling capabilities for NodeODM API compatible nodes. In a nutshell, it's a program to link together multiple [NodeODM](https://github.com/OpenDroneMap/NodeODM) API compatible nodes under a single network address. The program allows to distribute tasks across multiple nodes while taking in consideration factors such as maximum number of images, queue size and slots availability. It can also automatically spin up/down nodes based on demand using cloud computing providers (currently only [DigitalOcean](https://m.do.co/c/2977a7634f44)).

![image](https://user-images.githubusercontent.com/1951843/57490594-b9828180-7287-11e9-9328-740cc0be8f7e.png)

The program has been battle tested on the [WebODM Lightning Network](https://webodm.net) for quite some time and has proven reliable in processing thousands of datasets. However, if you find bugs, please [report them](https://github.com/OpenDroneMap/ClusterODM/issues).

## Installation

The only requirement is a working installation of [NodeJS](https://nodejs.org).

```bash
git clone https://github.com/OpenDroneMap/ClusterODM
cd ClusterODM
npm install
```

There's also a docker image available at `opendronemap/clusterodm`.

## Usage

First, start the program:

```bash
node index.js [parameters]
```

Or with docker:

```bash
docker run --rm -ti -p 3000:3000 -p 8080:8080 opendronemap/clusterodm [parameters]
```

Then connect to the CLI and connect new [NodeODM](https://github.com/OpenDroneMap/NodeODM) instances:

```bash
telnet localhost 8080
> HELP
> NODES ADD nodeodm-host 3001
> NODES LIST
```

Finally, use a web browser to connect to `http://localhost:3000`. A normal [NodeODM](https://github.com/OpenDroneMap/NodeODM) UI should appear. This means the application is working, as web requests are being properly forwarded to nodes.

See `node index.js --help` for all parameter options.

## Autoscale Setup

ClusterODM can spin up/down nodes based on demand. This allows users to reduce costs associated with always-on instances as well as being able to scale processing based on demand.

To setup autoscaling you must:
   * Make sure [docker-machine](https://docs.docker.com/machine/install-machine/) is installed.
   * Setup a S3-compatible bucket for storing results.
   * Create a configuration file.

Example configuration file:

```json
{
    "accessToken": "CHANGEME!",
    "s3":{
        "accessKey": "CHANGEME!",
        "secretKey": "CHANGEME!",
        "endpoint": "CHANGEME!",
        "bucket": "CHANGEME!"
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
| maxRuntime               | Maximum number of seconds a droplet is allowed to run ever. Set to -1 for no limit.                                                                                                                                                                                                                               |
| maxUploadTime            | Maximum number of seconds a droplet is allowed to receive file uploads. Set to -1 for no limit.                                                                                                                                                                                                                   |
| region                   | Region identifier where the droplets should be created.                                                                                                                                                                                                                                                           |
| monitoring               | Set to true to enable monitoring on the droplet.                                                                                                                                                                                                                                                                  |
| tags                     | List of tags to associate to the droplet.                                                                                                                                                                                                                                                                         |
| image                    | Image identifier (from public images) or snapshot identifier (private) if snapshot is set to `true` (see below).                                                                                                                                                                                                  |
| snapshot                 | When set to `true`, `image` refers to a snapshot in the user account instead of an image name. Useful to speed up boot time if you already have a droplet with the docker image preloaded.                                                                                                                        |
| imageSizeMapping         | Max images count to droplet size mapping. The autoscaler will pick a droplet size based on the number of images of the incoming task. Use this to control what size of droplet should correspond to which image count. The least powerful droplet able to process a certain number of images is always selected.  |
| addSwap                  | Optionally add this much swap space to the droplet as a factor of total RAM (`RAM * addSwap`). A value of `1` sets a swapfile equal to the available RAM.                                                                                                                                                         |
| dockerImage              | Docker image to launch                                                                                                                                                                                                                                                                                            |

You can then launch ClusterODM with:

```bash
node index.js --asr configuration.json
```

You should see the following messages in the console:

```bash
info: ASR: DigitalOceanAsrProvider
info: Can write to S3
info: Found docker-machine executable
```

You should always have at least one static NodeODM node attached to ClusterODM, even if you plan to use the autoscaler all the times. If you want all of your nodes to be autoscaled, you should add a "dummy" NodeODM node and lock it:

```
telnet localhost 8080
> NODE ADD localhost 3001
> NODE LOCK 1
> NODE LIST
1) localhost:3001 [online] [0/2] <version 1.5.1> [L]
```

This way all tasks will be automatically forwarded to the autoscaler.

## Roadmap

We have [plenty of goals](https://github.com/OpenDroneMap/ClusterODM/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement). If you want to help, or need help getting started contributing, get in touch on the [OpenDroneMap community forum](https://community.opendronemap.org).

## License

ClusterODM is licensed under the AGPL. [Contact us](https://www.masseranolabs.com/contact/) for other licensing options.
