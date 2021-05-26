/**
 *  ClusterODM - A reverse proxy, load balancer and task tracker for NodeODM
 *  Copyright (C) 2018-present MasseranoLabs LLC
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const config = require("../../config");

module.exports = class ValueCache {
    constructor(options = {}) {
        if (!options.expires) options.expires = -1;
        if (!options.cleanupInterval)
            options.cleanupInterval = 6 * 60 * 60 * 1000;

        this.options = options;
        this.cache = {};
        this.enabled = true;

        if (config.debug) this.disable();
        if (options.expires > 0)
            setInterval(() => {
                this.cleanup();
            }, this.options.cleanupInterval);
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = true;
    }

    cleanup() {
        Object.keys(this.cache).forEach((key) => {
            if (
                this.cache[key]._cachedtm + this.options.expires <
                new Date().getTime()
            ) {
                delete this.cache[key];
            }
        });
    }

    get(key) {
        if (
            this.enabled &&
            this.cache[key] !== undefined &&
            (this.options.expires < 0 ||
                this.cache[key]._cachedtm + this.options.expires >
                    new Date().getTime())
        ) {
            return this.cache[key].value;
        }
    }

    set(key, value) {
        const obj = {
            value,
            _cachedtm: new Date().getTime(),
        };
        this.cache[key] = obj;
        return obj.value;
    }
};
