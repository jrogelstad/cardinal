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
/*global datasource, Promise*/
(function (datasource) {
    "strict";

    function doBeforeInsertFiscalPeriod(obj) {
        return new Promise(function (resolve, reject) {
            if (!obj.newRec.parent) {
                throw new Error("Fiscal year is required.");
            }

            var getFiscalPeriod = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "FiscalPeriod",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "end",
                            operator: "<",
                            value: obj.newRec.end
                        }],
                        sort: [{
                            property: "end",
                            order: "DESC"
                        }],
                        limit: 1
                    }
                };

                function callback(resp) {
                    var prevPeriod;

                    // Set previous period to period found
                    if (resp.length) {
                        prevPeriod = resp[0];
                        obj.newRec.previous = prevPeriod;
                    } else {
                        obj.newRec.previous = null;
                    }

                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            var getFiscalYear = new Promise(function (resolve, reject) {
                var payload;

                payload = {
                    method: "GET",
                    name: "FiscalYear",
                    client: obj.client,
                    id: obj.newRec.parent.id
                };

                function callback(fiscalYear) {
                    if (!fiscalYear) {
                        throw new Error("Fiscal year not found");
                    }

                    if (new Date(fiscalYear.start) > new Date(obj.newRec.start)) {
                        throw new Error("Fiscal period can not start earlier than fiscal year start.");
                    }

                    if (new Date(fiscalYear.end) < new Date(obj.newRec.end)) {
                        throw new Error("Fiscal period can not end later than fiscal year end.");
                    }

                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            Promise.all([
                getFiscalPeriod,
                getFiscalYear
            ]).then(resolve).catch(reject);
        });
    }

    datasource.registerFunction("POST", "FiscalPeriod", doBeforeInsertFiscalPeriod,
            datasource.TRIGGER_BEFORE);

    function doAfterInsertFiscalPeriod(obj) {
        return new Promise(function (resolve, reject) {
            var account, prevPeriod,
                    accounts, currency, prevTrialBalance,
                    fiscalPeriod = obj.newRec;

            function createTrialBalance() {
                return new Promise(function (resolve, reject) {
                    var prev, balance, payload;

                    if (!accounts.length) {
                        resolve();
                        return;
                    }

                    account = accounts.shift();
                    prev = prevTrialBalance.find(function (row) {
                        return row.parent.id === account.id;
                    });
                    balance = prev
                        ? prev.balance.amount
                        : 0;

                    payload = {
                        method: "POST",
                        name: "TrialBalance",
                        client: obj.client,
                        callback: createTrialBalance,
                        data: {
                            kind: currency,
                            parent: account,
                            period: fiscalPeriod,
                            previous: prevPeriod,
                            balance: {
                                currency: currency.code,
                                amount: balance
                            },
                            debits: {
                                currency: currency.code,
                                amount: 0
                            },
                            credits: {
                                currency: currency.code,
                                amount: 0
                            }
                        }
                    };

                    // Recursively work through accounts
                    datasource.request(payload, true)
                        .then(createTrialBalance)
                        .then(resolve)
                        .catch(reject);
                });
            }

            var getCurrency = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Currency",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "isBase",
                            value: true
                        }]
                    }
                };

                function callback(resp) {
                    if (resp.length) {
                        currency = resp[0];
                        resolve();
                    } else {
                        reject("No base currency found");
                    }
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            var getFiscalPeriod = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "FiscalPeriod",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "end",
                            operator: "<",
                            value: fiscalPeriod.end
                        }],
                        sort: [{
                            property: "end",
                            order: "DESC"
                        }],
                        limit: 1
                    }
                };

                function afterFiscalPeriod(resp) {
                    return new Promise(function (resolve, reject) {
                        var prevPayload;

                        if (resp.length) {
                            prevPeriod = resp[0];

                            // Update previous period to have this as next period
                            prevPeriod.next = fiscalPeriod;

                            prevPayload = {
                                method: "POST",
                                name: "FiscalPeriod",
                                client: obj.client,
                                id: prevPeriod.id,
                                data: prevPeriod
                            };

                            datasource.request(prevPayload, true)
                                .then(resolve)
                                .catch(reject);

                            return;
                        }

                        resolve();
                    });
                }

                function getTrialBalance() {
                    return new Promise(function (resolve, reject) {
                        var cpayload = {
                            method: "GET",
                            name: "TrialBalance",
                            client: obj.client,
                            filter: {
                                criteria: [{
                                    property: "kind.type",
                                    operator: "IN",
                                    value: ["Asset", "Liability", "Equity"]
                                }, {
                                    property: "period",
                                    value: prevPeriod
                                }]
                            }
                        };

                        datasource.request(cpayload, true)
                            .then(resolve)
                            .catch(reject);
                    });
                }

                function afterTrialBalance(resp) {
                    prevTrialBalance = resp;
                    resolve();
                }

                Promise.resolve()
                    .then(datasource.request.bind(null, payload, true))
                    .then(afterFiscalPeriod)
                    .then(getTrialBalance)
                    .then(afterTrialBalance)
                    .catch(reject);
            });

            var getLedgerAccount = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "LedgerAccount",
                    client: obj.client
                };

                function callback(resp) {
                    accounts = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            Promise.all([
                getCurrency,
                getFiscalPeriod,
                getLedgerAccount
            ])
                .then(createTrialBalance)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "FiscalPeriod", doAfterInsertFiscalPeriod,
            datasource.TRIGGER_AFTER);

    /**
      Close a fiscal period.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Function} [payload.callback] callback.
      @param {Object} [payload.data] Payload data
      @param {Object} [payload.data.id] Fiscal period id to close. Required
    */
    var doCloseFiscalPeriod = function (obj) {
        return new Promise(function (resolve, reject) {
            var payload = {
                method: "POST",
                name: "closePeriod",
                client: obj.client,
                callback: obj.callback,
                data: obj.data
            };

            obj.data.feather = "FiscalPeriod";
            datasource.request(payload, true)
                .then(resolve)
                .catch(reject);
        });
    };

    datasource.registerFunction("POST", "closeFiscalPeriod", doCloseFiscalPeriod);

    /**
      Reopen a fiscal period.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Payload data
      @param {Object} [payload.data.id] Fiscal period id to open. Required
    */
    var doOpenFiscalPeriod = function (obj) {
        return new Promise(function (resolve, reject) {
            var payload = {
                method: "POST",
                name: "openPeriod",
                client: obj.client,
                data: obj.data
            };

            obj.data.feather = "FiscalPeriod";
            datasource.request(payload, true)
                .then(resolve)
                .catch(reject);
        });
    };

    datasource.registerFunction("POST", "openFiscalPeriod", doOpenFiscalPeriod);

    var doDeleteFiscalPeriod = function (obj) {
        return new Promise(function (resolve, reject) {
            var fiscalPeriod;

            // Validate
            function getFiscalPeriod() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "FiscalPeriod",
                        id: obj.id,
                        client: obj.client
                    };

                    function callback(resp) {
                        if (fiscalPeriod.status === "Closed") {
                            reject("Can not delete a closed period.");
                            return;
                        }

                        if (fiscalPeriod.status === "Frozen") {
                            reject("Can not delete a frozen period.");
                            return;
                        }

                        fiscalPeriod = resp;
                        resolve();
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function getNextFiscalPeriod() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "FiscalPeriod",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "end",
                                operator: ">",
                                value: fiscalPeriod.end
                            }],
                            limit: 1
                        }
                    };

                    function callback(resp) {
                        if (resp.length) {
                            reject("Can not delete a period with a subsequent period.");
                            return;
                        }

                        resolve();
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function getTrialBalances() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "TrialBalance",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "period",
                                value: fiscalPeriod
                            }]
                        }
                    };

                    function callback(resp) {
                        resp.forEach(function (trialBalance) {
                            if (trialBalance.debits !== 0 ||
                                    trialBalance.credits !== 0) {
                                reject("Can not delete period with trial balance activity posted.");
                                return;
                            }
                        });

                        resolve(resp);
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function doDeleteTrialBalances(resp) {
                return new Promise(function (resolve, reject) {
                    var deletions;

                    // Build array of deletion calls
                    deletions = resp.map(function (trialBalance) {
                        var payload = {
                            method: "DELETE",
                            name: "TrialBalance",
                            client: obj.client,
                            id: trialBalance.id
                        };

                        return datasource.request(payload, true);
                    });

                    Promise.all(deletions)
                        .then(resolve)
                        .catch(reject);
                });
            }

            Promise.resolve()
                .then(getFiscalPeriod)
                .then(getNextFiscalPeriod)
                .then(getTrialBalances)
                .then(doDeleteTrialBalances)
                .then(resolve.bind(null, true))
                .catch(reject);
        });
    };

    datasource.registerFunction("DELETE", "FiscalPeriod", doDeleteFiscalPeriod,
            datasource.TRIGGER_AFTER);

}(datasource));