import { html } from "../lib/preact.html.mjs";

/**
 *
 * @param {Object} param
 * @param {string} param.title
 * @param {boolean} param.open
 * @param {function} param.handlerClose
 * @param {function} param.handlerApply
 * @param {string} param.labelApply
 * @param {string|html} param.modalBody
 *
 * @returns
 */
export const Dialog = ({
  title = "Are you sure?",
  open,
  handlerClose,
  handlerApply,
  labelApply = "Apply",
  modalBody = "",
}) => {
  return html` <div class=${`modal fade ${open ? "show" : ""}`} id="exampleModal" aria-labelledby="exampleModalLabel">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="exampleModalLabel">${title}</h5>
        </div>
        <div class="modal-body">${modalBody}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-dismiss="modal" onClick=${handlerClose}>Close</button>
          <button type="button" class="btn btn-primary" onClick=${handlerApply}>${labelApply}</button>
        </div>
      </div>
    </div>
  </div>`;
};

/**
 * @param {Object} param
 * @param {boolean} param.open
 * @param {function} param.handlerClose
 * @param {function} param.handlerApply
 *
 * @returns
 */
export const DeleteInstanceDialog = ({ open, handlerClose, handlerApply }) =>
  html`<${Dialog}
    open=${open}
    handlerClose=${handlerClose}
    handlerApply=${handlerApply}
    labelApply="Delete"
    modalBody="Are you Really want to delete this instance?"
  />`;

/**
 * @param {Object} param
 * @param {boolean} param.open
 * @param {function} param.handlerClose
 * @param {function} param.handlerApply
 *
 * @returns
 */
export const AddInstanceDialog = ({ open, handlerClose, handlerApply }) =>
  html`<${Dialog}
    open=${open}
    title='Add Node engine instance'
    handlerClose=${handlerClose}
    handlerApply=${handlerApply}
    labelApply="Apply"
    modalBody=${html`<form>
      <div class="mb-3">
        <label for="hostname" class="col-form-label">Hostname:</label>
        <input type="text" class="form-control" id="hostname" />
      </div>
      <div class="mb-3">
        <label for="port" class="col-form-label">Port:</label>
        <input type="number" min="1" max="65535" class="form-control" id="port" />
      </div>
      <div class="mb-3">
        <label for="token" class="col-form-label">Token (optional):</label>
        <input type="text" class="form-control" id="token" />
      </div>
    </form>`}
  />`;
