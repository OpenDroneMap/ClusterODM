# ClusterODM Test Config

The test suite can be run easily via docker compose, which will run:
- A single NodeODM instance.
- A ClusterODM instance, with bundled config to link the two.
- A container to run the test suite via node / vitest.

```bash
docker compose run --rm tests
```
