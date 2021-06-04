import { deleteFetch, postFetch } from "../common.fetch.js";
import { useEffect, useState } from "../lib/hooks.module.js";
import { html } from "../lib/preact.html.mjs";
import { DeleteInstanceDialog } from "./dialog.mjs";
export const NodeList = ({ nodes = [], getData = () => {} }) => {
  const LockBtn = ({ isLock, number }) =>
    isLock
      ? html`<button class="btn btn-sm btn-outline-secondary mx-1" onClick=${(e) => doUnLock(number)}>
          <i class="bi bi-lock"></i>
          UNLOCK
        </button>`
      : html`<button class="btn btn-sm btn-outline-primary mx-1" onClick=${(e) => doLock(number)}>
          <i class="bi bi-lock-fill"></i>
          LOCK
        </button>`;
  const DelBtn = ({ number }) => {
    // onClick=${(e) => doDelete(number)}
    const [open, setOpen] = useState(false);
    const handlerOnClickBtn = (e) => {
      setOpen(!open);
    };
    const handlerClose = () => {
      setOpen(false);
    };
    return html`<div>
      <button class="btn btn-sm  btn-outline-danger" onClick=${handlerOnClickBtn}>
        <i class="bi bi-trash-fill"></i>
        DEL
      </button>
      <${DeleteInstanceDialog}
        open=${open}
        handlerClose=${handlerClose}
        handlerApply=${() => {
          doDelete(number);
        }}
      />
    </div>`;
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
        console.error(ex);
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
        console.error(ex);
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
        console.error(ex);
      });
  };
  return html` <table class="table table-hover table-striped">
    <thead>
      <tr class="text-white bg-primary">
        <th>#</th>
        <th>Node</th>
        <th>Status</th>
        <th>Queue</th>
        <th>Engine</th>
        <th>API</th>
        <th>CPU Cores</th>
        <th>RAM available</th>
        <!--<th>Last updated</th>-->
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
          <td>${node.nodeData.info.cpuCores}</td>
          <td>${getRamAvailable(node)}</td>
          <!--<td>${node.nodeData.lastRefreshed > 0 && new Date(node.nodeData.lastRefreshed).toLocaleString()}</td>-->
          <td>${flags.join(",")}</td>
          <td>
            <div class="btn-group" role="group">
              <${LockBtn} isLock=${node.isLocked} number=${idx + 1} />
              <${DelBtn} number=${idx + 1} />
            </div>
          </td>
        </tr>`;
      })}
    </tbody>
  </table>`;
};

const IsOnline = ({ isOnline = false }) =>
  isOnline ? html`<span class="badge bg-success">Online</span>` : html`<span class="badge bg-danger">Offline</span>`;

const getRamAvailable = (node) => {
  const { availableMemory, totalMemory } = node?.nodeData?.info;

  if (typeof availableMemory !== "number" || typeof totalMemory !== "number") return "";

  const percent = (availableMemory / totalMemory) * 100;
  const ram = `${bytesToSize(availableMemory)}/${bytesToSize(totalMemory)}`;
  const strPercent = `${percent.toFixed(2)}%`;
  return html`<span data-bs-toggle="tooltip" title=${ram}>${strPercent}</span>`;
};

const bytesToSize = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};
