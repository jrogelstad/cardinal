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
/*global f, require*/

const jsonpatch = require("fast-json-patch");

// Register database procedure on f.datasource
let doAdjust = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let transaction;
        let clb;
        let dlb;
        let args;
        let data = obj.data.specs;
        let requestId = f.createId();
        let date = data.date || f.now();
        let note = data.note;
        let quantity = data.quantity;
        let parents = [];

        args = {
            item: data.item,
            debitLocation: data.location,
            creditLocation: {
                id: "u69aj7cgtkmf"
            }
        };

        function afterGet(resp) {
            return new Promise(function (resolve) {
                args[this] = resp;
                resolve();
            });
        }

        function getParent(resp) {
            return new Promise(function (resolve, reject) {
                let payload;

                function callback(resp) {
                    return new Promise(function (resolve, reject) {
                        parents.push(resp);

                        getParent(resp).then(resolve).catch(reject);
                    });
                }

                if (resp.parent) {
                    payload = {
                        method: "GET",
                        name: "Location",
                        client: obj.client,
                        id: resp.parent.id
                    };

                    f.datasource.request(payload, true).then(
                        callback
                    ).catch(
                        reject
                    );

                    return;
                }

                resolve(resp);
            });
        }

        function postRequest() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "POST",
                    name: "Request",
                    client: obj.client,
                    isPosted: true,
                    data: {
                        id: requestId,
                        kind: args.item,
                        date: date,
                        note: note,
                        distributions: [{
                            node: args.debitLocation,
                            credit: quantity
                        }, {
                            node: args.creditLocation,
                            debit: quantity
                        }]
                    }
                };

                f.datasource.request(payload, true).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        function postTransaction() {
            return new Promise(function (resolve, reject) {
                let postDebitLocation;
                let postCreditLocation;
                let distributions;

                distributions = [{
                    node: args.debitLocation,
                    credit: quantity
                }, {
                    node: args.creditLocation,
                    debit: quantity
                }];

                parents.forEach(function (parent) {
                    distributions.push({
                        node: parent,
                        credit: quantity,
                        isPropagation: true
                    });
                });

                transaction = {
                    kind: args.item,
                    parent: {
                        id: requestId
                    },
                    date: date,
                    note: note,
                    distributions: distributions
                };

                let postInventory = new Promise(function (resolve, reject) {
                    let payload = {
                        method: "POST",
                        name: "InventoryTransaction",
                        client: obj.client,
                        data: transaction
                    };

                    function callback(resp) {
                        jsonpatch.applyPatch(resp, transaction);
                        resolve();
                    }

                    f.datasource.request(payload, true).then(
                        callback
                    ).catch(
                        reject
                    );
                });

                postDebitLocation = f.datasource.request({
                    method: "POST",
                    name: "LocationBalance",
                    id: dlb.id,
                    client: obj.client,
                    data: dlb
                }, true);

                postCreditLocation = f.datasource.request({
                    method: "POST",
                    name: "LocationBalance",
                    id: clb.id,
                    client: obj.client,
                    data: clb
                }, true);

                Promise.all([
                    postInventory,
                    postDebitLocation,
                    postCreditLocation
                ]).then(resolve).catch(reject);
            });
        }

        function propagate() {
            return new Promise(function (resolve, reject) {
                let parent;
                let payload;

                if (!parents.length) {
                    resolve(transaction);
                    return;
                }

                parent = parents.pop();

                function callback(resp) {
                    return new Promise(function (resolve, reject) {
                        let pb;
                        let cpayload;

                        if (resp.length) {
                            pb = resp[0];
                            pb.balance = pb.balance.minus(quantity);
                        } else {
                            pb = {
                                id: f.createId(),
                                node: parent,
                                balance: quantity * -1
                            };
                        }

                        cpayload = {
                            method: "POST",
                            name: "LocationBalance",
                            id: pb.id,
                            client: obj.client,
                            data: pb
                        };

                        Promise.resolve().then(
                            f.datasource.request.bind(null, cpayload, true)
                        ).then(
                            propagate
                        ).then(
                            resolve
                        ).catch(
                            reject
                        );
                    });
                }

                payload = {
                    method: "GET",
                    name: "LocationBalance",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "parent",
                            value: parent
                        }]
                    }
                };

                f.datasource.request(payload, true).then(
                    callback
                ).catch(
                    reject
                );
            });
        }

        let getItem = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "Item",
                client: obj.client,
                id: args.item.id
            };

            Promise.resolve().then(
                f.datasource.request.bind(null, payload, true)
            ).then(
                afterGet.bind("item")
            ).then(
                resolve
            ).catch(
                reject
            );
        });

        let getDebitLocation = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "Location",
                client: obj.client,
                id: args.debitLocation.id
            };

            Promise.resolve().then(
                f.datasource.request.bind(null, payload, true)
            ).then(
                afterGet.bind("debitLocation")
            ).then(
                resolve
            ).catch(
                reject
            );
        });

        let getCreditLocation = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "Location",
                client: obj.client,
                id: args.creditLocation.id
            };

            Promise.resolve().then(
                f.datasource.request.bind(null, payload, true)
            ).then(
                afterGet.bind("creditLocation")
            ).then(
                resolve
            ).catch(
                reject
            );
        });

        let getdlb = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "LocationBalance",
                client: obj.client,
                filter: {
                    criteria: [{
                        property: "parent",
                        value: args.debitLocation
                    }]
                }
            };

            function callback(resp) {
                if (resp.length) {
                    dlb = resp[0];
                    dlb.balance = dlb.balance.minus(quantity);
                } else {
                    dlb = {
                        id: f.createId(),
                        node: args.debitLocation,
                        balance: quantity * -1
                    };
                }

                resolve();
            }


            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        let getclb = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "LocationBalance",
                client: obj.client,
                filter: {
                    criteria: [{
                        property: "parent",
                        value: args.creditLocation
                    }]
                }
            };

            function callback(resp) {
                if (resp.length) {
                    clb = resp[0];
                    clb.balance = clb.balance.plus(quantity);
                } else {
                    clb = {
                        id: f.createId(),
                        parent: args.creditLocation,
                        balance: quantity
                    };
                }

                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        // Real work starts here
        Promise.all([
            getItem,
            getDebitLocation,
            getCreditLocation,
            getdlb,
            getclb
        ]).then(
            getParent.bind(null, args.debitLocation)
        ).then(
            postRequest
        ).then(
            postTransaction
        ).then(
            propagate
        ).then(
            resolve
        ).catch(
            reject
        );
    });
};

f.datasource.registerFunction("POST", "adjust", doAdjust);
