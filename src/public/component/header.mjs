import { html } from "../lib/preact.html.mjs";

export const Header = ({ info }) => {
  return html`
    <header class="py=-3">
      <div class="row flex-nowrap justify-content-between align-items-center">
        <div class="col-4 d-flex  align-items-center">
          <h2 class="text-left mt-2 mb-2">${info.name} ${info.version}</h2>
        </div>

        <div class="col-4 d-flex justify-content-end align-items-center">
          <a class="btn btn-sm btn-outline-secondary" href="/signout">
            <i class="bi bi-door-open-fill"></i>
            Signout
          </a>
        </div>
      </div>
    </header>
  `;
};
