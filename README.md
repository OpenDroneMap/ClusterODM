# ClusterODM
A reverse proxy, load balancer and task tracker for NodeODM

## Installation

```bash
npm install
```

## Usage

To start the program:

```bash
node index.js
```

To connect to the CLI and connect new NodeODM instances:

```bash
telnet localhost 8080
> HELP
> NODES ADD nodeodm-host 3001
> NODES LIST
```

Use a web browser to connect to `http://localhost:3000`.

See `node index.js --help` for more configuration options.

## Disclaimer

This software is alpha. More documentation is coming soon.
