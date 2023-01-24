# ClusterODM

A reverse proxy, load balancer and task tracker with optional cloud autoscaling capabilities for NodeODM API compatible nodes. In a nutshell, it's a program to link together multiple [NodeODM](https://github.com/OpenDroneMap/NodeODM) API compatible nodes under a single network address. The program allows to distribute tasks across multiple nodes while taking in consideration factors such as maximum number of images, queue size and slots availability. It can also automatically spin up/down nodes based on demand using cloud computing providers (currently [DigitalOcean](https://m.do.co/c/2977a7634f44), [Hetzner](https://www.hetzner.com), [Scaleway](https://scaleway.com) or [Amazon Web Services](https://aws.amazon.com/)).

![image](https://user-images.githubusercontent.com/1951843/57490594-b9828180-7287-11e9-9328-740cc0be8f7e.png)

The program has been battle tested on the [WebODM Lightning Network](https://webodm.net) for quite some time and has proven reliable in processing thousands of datasets. However, if you find bugs, please [report them](https://github.com/OpenDroneMap/ClusterODM/issues).

## Installation

The only requirement is a working installation of [NodeJS](https://nodejs.org) 14 or earlier (ClusterODM has compatibility issues with NodeJS 16 and later).

```bash
git clone https://github.com/OpenDroneMap/ClusterODM
cd ClusterODM
npm install
```

There's also a docker image available at `opendronemap/clusterodm` and a native [Windows bundle](#windows-bundle).

## Usage

First, start the program:

```bash
node index.js [parameters]
```

Or with docker:

```bash
docker run --rm -ti -p 3000:3000 -p 8080:8080 opendronemap/clusterodm [parameters]
```

Or with apptainer, after cd into ClusterODM directory:

```bash
apptainer run docker://opendronemap/clusterodm [parameters]
```

Then connect to the CLI and connect new [NodeODM](https://github.com/OpenDroneMap/NodeODM) instances:

```bash
telnet localhost 8080
> HELP
> NODE ADD nodeodm-host 3001
> NODE LIST
```

Finally, use a web browser to connect to `http://localhost:3000`. A normal [NodeODM](https://github.com/OpenDroneMap/NodeODM) UI should appear. This means the application is working, as web requests are being properly forwarded to nodes.

You can also check the status of nodes via a web interface available at `http://localhost:10000`.

See `node index.js --help` for all parameter options.

## Autoscale Setup

ClusterODM can spin up/down nodes based on demand. This allows users to reduce costs associated with always-on instances as well as being able to scale processing based on demand.

To setup autoscaling you must:
   * Make sure [docker-machine](https://gitlab.com/gitlab-org/ci-cd/docker-machine) is installed.
   * Setup a S3-compatible bucket for storing results.
   * Create a configuration file for [DigitalOcean](./docs/digitalocean.md), [Hetzner](./docs/hetzner.md), [Scaleway](./docs/scaleway.md), or [Amazon Web Services](./docs/aws.md) (click links to see examples)

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

You should always have at least one static NodeODM node attached to ClusterODM, even if you plan to use the autoscaler for all processing. If you setup auto scaling, you can't have zero nodes and rely 100% on the autoscaler. You need to attach a NodeODM node to act as the "reference node" otherwise ClusterODM will not know how to handle certain requests (for the forwarding the UI, for validating options prior to spinning up an instance, etc.). For this purpose, you should add a "dummy" NodeODM node and lock it:

```
telnet localhost 8080
> NODE ADD localhost 3001
> NODE LOCK 1
> NODE LIST
1) localhost:3001 [online] [0/2] <version 1.5.1> [L]
```

This way all tasks will be automatically forwarded to the autoscaler.

A docker-compose file is available to automatically setup both ClusterODM and NodeODM on the same machine by issuing:

```
docker-compose up
```

## HPC set up with SLURM

You can write a SLURM script to schedule and set up available nodes with NodeODM for the ClusterODM to be wired to if you are on the HPC. Using SLURM will decrease the amount of time and processes needed to set up nodes for ClusterODM each time. This provides an easier way for user to use ODM on the HPC.

To setup HPC with SLURM, you must have make sure SLURM is installed.


## Windows Bundle

ClusterODM can run as a self-contained executable on Windows without the need for additional dependencies. You can download the latest `clusterodm-windows-x64.zip` bundle from the [releases](https://github.com/OpenDroneMap/ClusterODM/releases) page. Extract the contents in a folder and run:

```bash
clusterodm.exe
```

## Roadmap

We have [plenty of goals](https://github.com/OpenDroneMap/ClusterODM/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement). If you want to help, or need help getting started contributing, get in touch on the [OpenDroneMap community forum](https://community.opendronemap.org).
