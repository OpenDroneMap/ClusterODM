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

## Windows Bundle

ClusterODM can run as a self-contained executable on Windows without the need for additional dependencies. You can download the latest `clusterodm-windows-x64.zip` bundle from the [releases](https://github.com/OpenDroneMap/ClusterODM/releases) page. Extract the contents in a folder and run:

```bash
clusterodm.exe
```

## HPC set up with SLURM

You can write a SLURM script to schedule and set up available nodes with NodeODM for the ClusterODM to be wired to if you are on the HPC. Using SLURM will decrease the amount of time and processes needed to set up nodes for ClusterODM each time. This provides an easier way for user to use ODM on the HPC.

To setup HPC with SLURM, you must make sure SLURM is installed.

SLURM script will be different from cluster to cluster, depending on which nodes in the cluster that you have. However, the main idea is we want to run NodeODM on each node once, and by default, each NodeODM will be running on port 3000. Apptainer will be taking available ports starting from port 3000, so if your node's port 3000 is open, by default NodeODM will be run on that node. After that, we want to run ClusterODM on the head node and connect the running NodeODMs to the ClusterODM. With that, we will have a functional ClusterODM running on HPC.

Here is an example of SLURM script assigning nodes 48, 50, 51 to run NodeODM. You can freely change and use it depending on your system:

![image](https://user-images.githubusercontent.com/70782465/214411148-cdf43e44-9756-4115-9195-d1f36b3a31b9.png)

You can check for available nodes using sinfo:

```
sinfo
```

Run the following command to schedule using the SLURM script:

```
sbatch sample.slurm
```

You can also check for currently running jobs using squeue:

```
squeue -u $user
```

Unfortunately, SLURM does not handle assigning jobs to the head node. Hence, if we want to run ClusterODM on the head node, we have to run it locally. After that, you can connect to the CLI and wire the NodeODMs to the ClusterODMs. Here is an example following the sample SLURM script:

```
telnet localhost 8080
> NODE ADD node48 3000
> NODE ADD node50 3000
> NODE ADD node51 3000
> NODE LIST
```

You should always check to make sure which ports are being used to run NodeODM if ClusterODM is not wired correctly.

It is also possible to pre-populate nodes using JSON. If starting ClusterODM from apptainer or docker, the relevant JSON is available at `docker/data/nodes.json`. Contents might look similar to the following:

```javascript
[
        {"hostname":"node48","port":"3000","token":""},
        {"hostname":"node50","port":"3000","token":""},
        {"hostname":"node51","port":"3000","token":""}
]

```

After finish hosting ClusterODM on the head node and finish wiring it to the NodeODM, you can try tunneling to see if ClusterODM works as expected. Open another shell window in your local machine and tunnel them to the HPC using the following command:

```
ssh -L localhost:10000:localhost:10000 user@hostname
```

Replace user and hostname with your appropriate username and the hpc address. Basically, this command will tunnel the port of the hpc to your local port. After this, open a browser in your local machine and connect to `http://localhost:10000`. Port 10000 is where ClusterODM's administrative web interface is hosted at. This is what it looks like:

![image](https://user-images.githubusercontent.com/70782465/214938402-707bee90-ea17-4573-82f8-74096d9caf03.png)

Here you can check the NodeODMs status and even add or delete working nodes.

After that, do tunneling for port 3000 of the HPC to your local machine:

```
ssh -L localhost:3000:localhost:3000 user@hostname
```

Port 3000 is ClusterODM's proxy. This is the place we assign tasks to ClusterODM. Once again, connect to `http://localhost:3000` with your browser after tunneling. Here, you can Assign Tasks and observe the tasks' processes.

![image](https://user-images.githubusercontent.com/70782465/214938234-113f99dc-f69e-4e78-a782-deaf94e986b0.png)

After adding images in this browser, you can press Start Task and see ClusterODM assigning tasks to the nodes you have wired to. Go for a walk and check the progress.


## Roadmap

We have [plenty of goals](https://github.com/OpenDroneMap/ClusterODM/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement). If you want to help, or need help getting started contributing, get in touch on the [OpenDroneMap community forum](https://community.opendronemap.org).
