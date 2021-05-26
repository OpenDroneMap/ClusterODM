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
const config = require("../config");

let userTasks = null;

module.exports = {
    initialize: function () {
        userTasks = {};

        const forgive = () => {
            Object.keys(userTasks).forEach((userToken) => {
                if (userTasks[userToken].count > 0) {
                    userTasks[userToken].count = Math.floor(
                        userTasks[userToken].count * 0.66
                    );
                }

                if (userTasks[userToken].count <= 0) {
                    delete userTasks[userToken];
                }
            });
        };

        setInterval(forgive, 1000 * 60 * this.FORGIVE_TIME);
    },

    FORGIVE_TIME: 15, // minutes

    recordTaskInit: function (userToken) {
        this.modifyRecord(userToken, (record) => {
            record.count = record.count ? record.count + 1 : 1;
        });
    },

    recordTaskCommit: function (userToken) {
        this.modifyRecord(userToken, (record) => {
            record.count = Math.max(record.count - 1, 0);
        });
    },

    isFlooding: function (userToken) {
        if (config.flood_limit <= 0) return false; // Disabled
        if (!userToken) userToken = "default";

        const record = userTasks[userToken];
        if (!record) return false; // No record

        return record.count > config.flood_limit;
    },

    modifyRecord: function (userToken, callback) {
        if (!userToken) userToken = "default";

        const record = userTasks[userToken] || {};

        callback(record);

        userTasks[userToken] = record;
    },
};
