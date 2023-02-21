import { postFetch } from "../common.fetch.js";
import { useState } from "../lib/hooks.module.js";
import { html } from "../lib/preact.html.mjs";
import { AddInstanceDialog } from "./dialog.mjs";

export const AddInstanceButton = ({ getNodes }) => {
  const [open, setOpen] = useState(false);

  const handlerApply = (props) => {
    const domDialog = props.currentTarget.closest(".modal-dialog");
    if (domDialog) {
      const domhostName = domDialog.querySelector("#hostname");
      const domPort = domDialog.querySelector("#port");
      const domToken = domDialog.querySelector("#token");
      const hostname = domhostName.value;
      const port = Number(domPort.value);
      const token = domToken.value;

      doAddNode(hostname, port, token);

      //Clearing
      domDialog.querySelector("#hostname").value = "";
      domDialog.querySelector("#port").value = "";
      domDialog.querySelector("#token").value = "";
      setOpen(false);
    }
  };

  const doAddNode = (hostname, port, token) => {
    postFetch("/r/node/add", {
      body: { hostname, port, token },
    })
      .then((res) => res.json())
      .then((isSuccess) => {
        getNodes();
      })
      .catch((err) => {
        console.error(err);
      });
  };

  return html`<><button classList="btn btn-primary" onClick=${() => setOpen(true)}>Add Node</button>
    <${AddInstanceDialog}
      open=${open}
      handlerClose=${() => setOpen(false)}
      handlerApply=${handlerApply}
    ></${AddInstanceDialog}>`;
};
