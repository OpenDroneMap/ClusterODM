import { html, render } from "https://unpkg.com/htm/preact/index.mjs?module";
import {
  useState,
  useEffect,
} from "https://unpkg.com/preact@10.4.7/hooks/dist/hooks.mjs?module";

// Create your app
export default function App(props) {
  const [version, setVersion] = useState(null);
  const [nodes, setNodes] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalHandler, setIntervalHandler] = useState(-1);

  const postFetch = async (url, { body }) => {
    return await fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };

  const deleteFetch = async (url, { body }) => {
    return await fetch(url, {
      method: "delete",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };

  useEffect(() => {
    getData();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const handler = setInterval(getData, 5000);

      setIntervalHandler(handler);
    } else {
      if (intervalHandler) {
        clearInterval(intervalHandler);
        setIntervalHandler(-1);
      }
    }
  }, [autoRefresh]);

  const getData = () => {
    console.log("getData...");
    fetch("/r/package_info")
      .then((res) => res.json())
      .then((package_info) => {
        setVersion(package_info.version);
      })
      .catch((ex) => {
        console.error(ex);
      });
    fetch("/r/node/list")
      .then((res) => res.json())
      .then((nodes) => {
        setNodes(nodes);
      })
      .catch((ex) => {
        console.error(ex);
      });
  };

  const doLock = (number) => {
    postFetch("/r/node/lock", {
      body: { number },
    })
      .then((res) => res.json())
      .then((isSuccess) => {
        getData();
      })
      .catch((ex) => {
        console.log(err);
      });
  };

  const doUnLock = (number) => {
    postFetch("/r/node/unlock", {
      body: { number },
    })
      .then((res) => res.json())
      .then((isSuccess) => {
        getData();
      })
      .catch((ex) => {
        console.log(err);
      });
  };

  const doDelete = (number) => {
    deleteFetch("/r/node", {
      body: { number },
    })
      .then((res) => res.json())
      .then((isSuccess) => {
        getData();
      })
      .catch((ex) => {
        console.log(err);
      });
  };

  const LockBtn = ({ isLock, number }) =>
    isLock
      ? html`<button
          class="btn btn-sm btn-outline-secondary mx-1"
          onClick=${(e) => doUnLock(number)}
        >
          UNLOCK
        </button>`
      : html`<button
          class="btn btn-sm btn-outline-primary mx-1"
          onClick=${(e) => doLock(number)}
        >
          LOCK
        </button>`;
  const DelBtn = ({ number }) => html`<button
    class="btn btn-sm btn-danger mx-1"
    onClick=${(e) => doDelete(number)}
  >
    DEL
  </button>`;
  return html`<div class="container">
    <header class="py=-3">
      <div class="row flex-nowrap justify-content-between align-items-center">
        <div class="col-4 d-flex  align-items-center">
          <h2 class="text-left mt-2 mb-2">
            ${version && `ClusterODM ${version}`}
          </h2>
        </div>
        <div class="col-4 d-flex justify-content-end align-items-center">
          <a class="btn btn-sm btn-outline-secondary" href="/signout">
            sign out
          </a>
        </div>
      </div>
    </header>

    <table class="table table-hover table-striped">
      <thead>
        <tr class="text-white bg-primary">
          <th>#</th>
          <th>Node</th>
          <th>Status</th>
          <th>Queue</th>
          <th>Engine</th>
          <th>API</th>
          <th>Flags</th>
          <th>-</th>
        </tr>
      </thead>
      <tbody>
        ${nodes &&
        nodes.map((node, idx) => {
          const flags = [];
          if (node.isLocked) flags.push("L");
          if (node.isAutoSpawned) flags.push("A");
          return html`<tr>
            <td>${idx + 1}</td>
            <td>${node.name}</td>
            <td>
              <${IsOnline} isOnline=${node.isOnline} />
            </td>
            <td>${node.getTaskQueueCount}/${node.getMaxParallelTasks}</td>
            <td>${node.getEngineInfo}</td>
            <td>${node.getVersion}</td>
            <td>${flags.join(",")}</td>
            <td>
              <${LockBtn} isLock=${node.isLocked} number=${idx + 1} />
              <${DelBtn} number=${idx + 1} />
            </td>
          </tr>`;
        })}
      </tbody>
    </table>

    <div id="btn-refresh" class="text-end">
      <${RefreshBtn}
        autoRefresh=${autoRefresh}
        setAutoRefresh=${setAutoRefresh}
      />
    </div>
  </div>`;
}

const IsOnline = ({ isOnline = false }) =>
  isOnline
    ? html`<span class="badge bg-success">Online</span>`
    : html`<span class="badge bg-danger">Offline</span>`;

const RefreshBtn = ({ autoRefresh, setAutoRefresh }) =>
  autoRefresh
    ? html`<button
        classList="btn btn-danger"
        onClick=${() => setAutoRefresh(false)}
      >
        Disable Auto Refresh
      </button>`
    : html`<button
        classList="btn btn-success"
        onClick=${() => setAutoRefresh(true)}
      >
        Enable Auto Refresh
      </button>`;
