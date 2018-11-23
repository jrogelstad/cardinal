/**
    Framework for building object relational database apps
    Copyright (C) 2018  John Rogelstad

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
/*global datasource, require, Promise*/
/*jslint this, es6*/
(function (datasource) {
    "strict";

    const f = require("./common/core");
    const jsonpatch = require("fast-json-patch");

    // Register database procedure on datasource
    var doAdjust = function (obj) {
        return new Promise(function (resolve, reject) {
            var transaction, creditLocationBalance, debitLocationBalance, args,
                    data = obj.data.specs,
                    requestId = f.createId(),
                    date = data.date || f.now(),
                    note = data.note,
                    quantity = data.quantity,
                    parents = [];

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
                    var payload;

                    function callback(resp) {
                        return new Promise(function (resolve, reject) {
                            parents.push(resp);

                            getParent(resp)
                                .then(resolve)
                                .catch(reject);
                        });
                    }

                    if (resp.parent) {
                        payload = {
                            method: "GET",
                            name: "Location",
                            client: obj.client,
                            id: resp.parent.id
                        };

                        datasource.request(payload, true)
                            .then(callback)
                            .catch(reject);
                        return;
                    }

                    resolve(resp);
                });
            }

            function postRequest() {
                return new Promise(function (resolve, reject) {
                    var payload = {
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

                    datasource.request(payload, true)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function postTransaction() {
                return new Promise(function (resolve, reject) {
                    var postDebitLocation, postCreditLocation, distributions;

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

                    var postInventory = new Promise(function (resolve, reject) {
                        var payload = {
                            method: "POST",
                            name: "InventoryTransaction",
                            client: obj.client,
                            data: transaction
                        };

                        function callback(resp) {
                            jsonpatch.apply(resp, transaction);
                            resolve();
                        }

                        datasource.request(payload, true)
                            .then(callback)
                            .catch(reject);
                    });

                    postDebitLocation = datasource.request({
                        method: "POST",
                        name: "LocationBalance",
                        id: debitLocationBalance.id,
                        client: obj.client,
                        data: debitLocationBalance
                    }, true);

                    postCreditLocation = datasource.request({
                        method: "POST",
                        name: "LocationBalance",
                        id: creditLocationBalance.id,
                        client: obj.client,
                        data: creditLocationBalance
                    }, true);

                    Promise.all([
                        postInventory,
                        postDebitLocation,
                        postCreditLocation
                    ])
                        .then(resolve)
                        .catch(reject);
                });
            }

            function propagate() {
                return new Promise(function (resolve, reject) {
                    var parent, payload;

                    if (!parents.length) {
                        resolve(transaction);
                        return;
                    }

                    parent = parents.pop();

                    function callback(resp) {
                        return new Promise(function (resolve, reject) {
                            var parentBalance, cpayload;

                            if (resp.length) {
                                parentBalance = resp[0];
                                parentBalance.balance = parentBalance.balance.minus(quantity);
                            } else {
                                parentBalance = {
                                    id: f.createId(),
                                    kind: args.item,
                                    node: parent,
                                    balance: quantity * -1
                                };
                            }

                            cpayload = {
                                method: "POST",
                                name: "LocationBalance",
                                id: parentBalance.id,
                                client: obj.client,
                                data: parentBalance
                            };

                            Promise.resolve()
                                .then(datasource.request.bind(null, cpayload, true))
                                .then(propagate)
                                .then(resolve)
                                .catch(reject);
                        });
                    }

                    payload = {
                        method: "GET",
                        name: "LocationBalance",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "kind",
                                value: args.item
                            }, {
                                property: "parent",
                                value: parent
                            }]
                        }
                    };

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            var getItem = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Item",
                    client: obj.client,
                    id: args.item.id
                };

                Promise.resolve()
                    .then(datasource.request.bind(null, payload, true))
                    .then(afterGet.bind("item"))
                    .then(resolve)
                    .catch(reject);
            });

            var getDebitLocation = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Location",
                    client: obj.client,
                    id: args.debitLocation.id
                };

                Promise.resolve()
                    .then(datasource.request.bind(null, payload, true))
                    .then(afterGet.bind("debitLocation"))
                    .then(resolve)
                    .catch(reject);
            });

            var getCreditLocation = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Location",
                    client: obj.client,
                    id: args.creditLocation.id
                };

                Promise.resolve()
                    .then(datasource.request.bind(null, payload, true))
                    .then(afterGet.bind("creditLocation"))
                    .then(resolve)
                    .catch(reject);
            });

            var getDebitLocationBalance = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "LocationBalance",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "kind",
                            value: args.item
                        }, {
                            property: "parent",
                            value: args.debitLocation
                        }]
                    }
                };

                function callback(resp) {
                    if (resp.length) {
                        debitLocationBalance = resp[0];
                        debitLocationBalance.balance = debitLocationBalance.balance.minus(quantity);
                    } else {
                        debitLocationBalance = {
                            id: f.createId(),
                            kind: args.item,
                            node: args.debitLocation,
                            balance: quantity * -1
                        };
                    }

                    resolve();
                }


                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            var getCreditLocationBalance = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "LocationBalance",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "kind",
                            value: args.item
                        }, {
                            property: "parent",
                            value: args.creditLocation
                        }]
                    }
                };

                function callback(resp) {
                    if (resp.length) {
                        creditLocationBalance = resp[0];
                        creditLocationBalance.balance = creditLocationBalance.balance.plus(quantity);
                    } else {
                        creditLocationBalance = {
                            id: f.createId(),
                            kind: args.item,
                            parent: args.creditLocation,
                            balance: quantity
                        };
                    }

                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            // Real work starts here
            Promise.all([
                getItem,
                getDebitLocation,
                getCreditLocation,
                getDebitLocationBalance,
                getCreditLocationBalance
            ])
                .then(getParent.bind(null, args.debitLocation))
                .then(postRequest)
                .then(postTransaction)
                .then(propagate)
                .then(resolve)
                .catch(reject);
        });
    };

    datasource.registerFunction("POST", "adjust", doAdjust);

}(datasource));