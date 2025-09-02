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

let userTasks = {};
const LIMIT_WINDOW = 60 * 1000; // 1 minute

module.exports = {
    checkCommitLimitReached: function(maxConcurrentTasks, userToken){
        if (maxConcurrentTasks === 0) return true;
        if (!maxConcurrentTasks) return false;

        if (!userToken) userToken = "default";
        let now = new Date().getTime();

        // Remove expired items
        for (let t in userTasks){
            userTasks[t] = userTasks[t].filter(tm => now - tm <= LIMIT_WINDOW);
            if (userTasks[t].length === 0) delete(userTasks[t]);
        }

        if (userTasks[userToken] === undefined) userTasks[userToken] = [];

        userTasks[userToken].push(now);
        return userTasks[userToken].length > maxConcurrentTasks;
    },

    decreaseCount: function(userToken){
        if (!userToken) userToken = "default";
        if (userTasks[userToken] !== undefined && userTasks[userToken].length > 0){
            userTasks[userToken].shift();
        }
    },
};