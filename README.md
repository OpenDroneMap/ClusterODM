# ClusterODM

A reverse proxy, load balancer and task tracker for NodeODM. In a nutshell, it's a program to link together multiple [NodeODM](https://github.com/OpenDroneMap/NodeODM) nodes under a single network address. The program allows to distribute tasks across multiple nodes while taking in consideration factors such as maximum number of images, queue size and slots availability.

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

## Roadmap

We have [plenty of goals](https://github.com/OpenDroneMap/ClusterODM/issues?q=is%3Aopen+is%3Aissue+label%3Aenhancement). If you want to help, or need help getting started contributing, get in touch on the [OpenDroneMap community forum](https://community.opendronemap.org).
