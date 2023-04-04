import { html } from "../lib/preact.html.mjs";

export const RefreshButton = ({ autoRefresh, setAutoRefresh }) =>
  autoRefresh.isAutoRefresh
    ? html`<button classList="btn btn-danger" onClick=${() => setAutoRefresh({ ...autoRefresh, isAutoRefresh: false })}>
        Disable Auto Refresh
      </button>`
    : html`<button classList="btn btn-success" onClick=${() => setAutoRefresh({ ...autoRefresh, isAutoRefresh: true })}>
        Enable Auto Refresh
      </button>`;
