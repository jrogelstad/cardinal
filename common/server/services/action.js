/**
    Framework for building object relational database apps
    Copyright (C) 2019  John Rogelstad

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/
/*jslint browser, this*/
/*global f*/

// Fetch nodes refereced by action distribution
function getNodes(action) {
    "use strict";

    let obj = this;

    return new Promise(function (resolve, reject) {
        let payload;
        let ids;

        ids = action.distributions.map(function (dist) {
            return dist.node.id;
        });

        if (ids.length) {
            payload = {
                method: "GET",
                name: "Node",
                client: obj.client,
                filter: {
                    criteria: [{
                        property: "id",
                        operator: "IN",
                        value: ids
                    }]
                }
            };

            f.datasource.request(payload, true).then(resolve).catch(reject);

            return;
        }

        resolve([]);
    });
}

// Update nodes whether used or not depending on
// action history
function updateNodes(nodes) {
    "use strict";

    let obj = this;

    return new Promise(function (resolve, reject) {
        let requests = nodes.map(function (node) {
            let payload = {
                method: "GET",
                name: "Distribution",
                properties: ["id"],
                client: obj.client,
                filter: {
                    criteria: [{
                        property: "node.id",
                        operator: "=",
                        value: node.id
                    }],
                    limit: 1
                }
            };

            function callback(resp) {
                return new Promise(function (resolve, reject) {
                    let payload2 = {
                        method: "POST",
                        name: "Node",
                        id: node.id,
                        client: obj.client,
                        data: node
                    };

                    if (!resp.length) {
                        node.isUsed = false;
                    } else {
                        node.isUsed = true;
                    }

                    f.datasource.request(payload2, true).then(
                        resolve
                    ).catch(
                        reject
                    );
                });
            }

            return f.datasource.request(payload, true).then(
                callback
            ).catch(
                reject
            );
        });

        Promise.all(requests).then(resolve).catch(reject);
    });
}

function doAfterInsertAction(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        Promise.resolve().then(
            getNodes.bind(obj, obj.data)
        ).then(
            updateNodes.bind(obj)
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "POST",
    "Action",
    doAfterInsertAction,
    f.datasource.TRIGGER_AFTER
);

function doCacheAction(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        function getAction() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "GET",
                    name: "Action",
                    id: obj.id,
                    client: obj.client
                };

                f.datasource.request(
                    payload,
                    true
                ).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        function cacheAction(action) {
            return new Promise(function (resolve) {
                obj.cache = action;
                resolve();
            });
        }

        Promise.resolve().then(
            getAction
        ).then(
            cacheAction
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "PATCH",
    "Action",
    doCacheAction,
    f.datasource.TRIGGER_BEFORE
);

f.datasource.registerFunction(
    "DELETE",
    "Action",
    doCacheAction,
    f.datasource.TRIGGER_BEFORE
);

function doAfterUpdateAction(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {

        function processPatch() {
            return new Promise(function (resolve) {
                let filtered;
                let idx;
                let action = {
                    distributions: []
                };

                filtered = obj.data.filter(function (item) {
                    if (item.path.search("^/distributions") > -1) {
                        return (
                            (item.op === "add") || (
                                item.op === "replace" &&
                                (
                                    item.value === undefined ||
                                    item.path.search("node/id$") > -1
                                )
                            )
                        );
                    }

                    return false;
                });

                filtered.forEach(function (item) {
                    let dist = {
                        node: {}
                    };

                    // New distribution
                    if (item.op === "add") {
                        dist.node.id = item.value.node.id;
                        action.distributions.push(dist);
                    } else {

                        // Distribution node changed
                        if (item.op === "replace" && item.value) {
                            // New node
                            dist.node.id = item.value;
                            action.distributions.push(dist);
                        }

                        // Old node (changed or deleted)
                        idx = item.path.slice(15, 16);
                        dist = {
                            node: {
                                id: obj.cache.distributions[idx].node.id
                            }
                        };
                        action.distributions.push(dist);
                    }
                });

                resolve(action);
            });
        }

        Promise.resolve().then(
            processPatch
        ).then(
            getNodes.bind(obj)
        ).then(
            updateNodes.bind(obj)
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "PATCH",
    "Action",
    doAfterUpdateAction,
    f.datasource.TRIGGER_AFTER
);


function doAfterDeleteAction(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let action = obj.cache;

        Promise.resolve().then(
            getNodes.bind(obj, action)
        ).then(
            updateNodes.bind(obj)
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "DELETE",
    "Action",
    doAfterDeleteAction,
    f.datasource.TRIGGER_AFTER
);
