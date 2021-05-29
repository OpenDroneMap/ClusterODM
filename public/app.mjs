import { html, render } from "./lib/preact.html.mjs";
import { useState, useEffect, useCallback } from "./lib/hooks.module.js";
import { NodeList } from "./component/nodeList.mjs";
import { Header } from "./component/header.mjs";
import { RefreshButton } from "./component/refreshButton.mjs";

const getInfoData = async () => {
  console.log("try getInfoData");
  const res = await fetch("/r/info");
  const json = res.json();
  return json;
};
const getNodesData = async () => {
  console.log("try getNodesData");
  const res = await fetch("/r/node/list");
  const json = res.json();
  return json;
};
const useNodes = () => {
  const [nodes, setNodes] = useState([]);
  const getData = () => {
    console.log("try get nodes");
    getNodesData().then((nodes) => setNodes(nodes));
  };

  return [nodes, getData];
};

export default function App() {
  const [info, setInfo] = useState({ name: "", version: "" });
  const [nodes, getNodes] = useNodes();

  const [autoRefresh, setAutoRefresh] = useState({ isAutoRefresh: false, intervalHandler: null });

  useEffect(() => {
    getInfoData().then((infoData) => setInfo(infoData));
    getNodes();
  }, []);

  useEffect(() => {
    if (autoRefresh.isAutoRefresh) {
      const intervalHandler = setInterval(() => {
        getNodes();
      }, 5000);
      setAutoRefresh({ ...autoRefresh, intervalHandler });
    } else {
      if (autoRefresh.intervalHandler > 0) {
        clearInterval(autoRefresh.intervalHandler);
        setAutoRefresh({ ...autoRefresh, intervalHandler: null });
      }
    }
  }, [autoRefresh.isAutoRefresh]);

  return html` <div class="container">
    <${Header} info=${info} />
    <${NodeList} nodes=${nodes} getData=${getNodes} />
    <div id="btn-refresh" class="text-end">
      <${RefreshButton} autoRefresh=${autoRefresh} setAutoRefresh=${setAutoRefresh} />
    </div>
  </div>`;
}
