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
/*jslint browser*/
/*global f*/

function doHandleFiscalPeriod(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        if (!obj.newRec.parent) {
            throw new Error("Fiscal year is required.");
        }

        let getFiscalPeriod = new Promise(function (resolve, reject) {
            let payload = {
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
                let prevPeriod;

                // Set previous period to period found
                if (resp.length) {
                    prevPeriod = resp[0];
                    obj.newRec.previous = prevPeriod;
                } else {
                    obj.newRec.previous = null;
                }

                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        let getFiscalYear = new Promise(function (resolve, reject) {
            let payload;

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
                    throw new Error(
                        "Fiscal period can not start earlier than fiscal " +
                        "year start."
                    );
                }

                if (new Date(fiscalYear.end) < new Date(obj.newRec.end)) {
                    throw new Error(
                        "Fiscal period can not end later than fiscal year end."
                    );
                }

                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        Promise.all([
            getFiscalPeriod,
            getFiscalYear
        ]).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "FiscalPeriod",
    doHandleFiscalPeriod,
    f.datasource.TRIGGER_BEFORE
);

f.datasource.registerFunction(
    "PATCH",
    "FiscalPeriod",
    doHandleFiscalPeriod,
    f.datasource.TRIGGER_BEFORE
);

function doAfterInsertFiscalPeriod(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let account;
        let prevPeriod;
        let accounts;
        let currency;
        let prevTrialBalance;
        let fiscalPeriod = obj.newRec;

        function createTrialBalance() {
            return new Promise(function (resolve, reject) {
                let prev;
                let balance;
                let payload;

                if (!accounts.length) {
                    resolve();
                    return;
                }

                account = accounts.shift();
                prev = prevTrialBalance.find(function (row) {
                    return row.parent.id === account.id;
                });
                balance = (
                    prev
                    ? prev.balance.amount
                    : 0
                );

                payload = {
                    method: "POST",
                    name: "TrialBalance",
                    client: obj.client,
                    callback: createTrialBalance,
                    data: {
                        code: account.code + " - " + fiscalPeriod.name,
                        currency: currency,
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
                f.datasource.request(payload, true).then(
                    createTrialBalance
                ).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        let getCurrency = new Promise(function (resolve, reject) {
            let payload = {
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

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        let getFiscalPeriod = new Promise(function (resolve, reject) {
            let payload = {
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
                    let prevPayload;

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

                        f.datasource.request(prevPayload, true).then(
                            resolve
                        ).catch(
                            reject
                        );

                        return;
                    }

                    resolve();
                });
            }

            function getTrialBalance() {
                return new Promise(function (resolve, reject) {
                    let cpayload = {
                        method: "GET",
                        name: "TrialBalance",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "parent.type",
                                operator: "IN",
                                value: ["A", "L", "Q"]
                            }, {
                                property: "period",
                                value: prevPeriod
                            }]
                        }
                    };

                    f.datasource.request(cpayload, true).then(
                        resolve
                    ).catch(
                        reject
                    );
                });
            }

            function afterTrialBalance(resp) {
                prevTrialBalance = resp;
                resolve();
            }

            Promise.resolve().then(
                f.datasource.request.bind(null, payload, true)
            ).then(
                afterFiscalPeriod
            ).then(
                getTrialBalance
            ).then(
                afterTrialBalance
            ).catch(
                reject
            );
        });

        let getLedgerAccount = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "LedgerAccount",
                client: obj.client
            };

            function callback(resp) {
                accounts = resp;
                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        Promise.all([
            getCurrency,
            getFiscalPeriod,
            getLedgerAccount
        ]).then(
            createTrialBalance
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "POST",
    "FiscalPeriod",
    doAfterInsertFiscalPeriod,
    f.datasource.TRIGGER_AFTER
);

/**
  Close a fiscal period.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Function} [payload.callback] callback.
  @param {Object} [payload.data] Payload data
  @param {Object} [payload.data.id] Fiscal period id to close. Required
*/
let doCloseFiscalPeriod = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let payload = {
            method: "POST",
            name: "closePeriod",
            client: obj.client,
            callback: obj.callback,
            data: obj.data
        };

        obj.data.feather = "FiscalPeriod";
        f.datasource.request(payload, true).then(resolve).catch(reject);
    });
};

f.datasource.registerFunction("POST", "closeFiscalPeriod", doCloseFiscalPeriod);

/**
  Reopen a fiscal period.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Object} [payload.data] Payload data
  @param {Object} [payload.data.id] Fiscal period id to open. Required
*/
let doOpenFiscalPeriod = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let payload = {
            method: "POST",
            name: "openPeriod",
            client: obj.client,
            data: obj.data
        };

        obj.data.feather = "FiscalPeriod";
        f.datasource.request(payload, true).then(resolve).catch(reject);
    });
};

f.datasource.registerFunction("POST", "openFiscalPeriod", doOpenFiscalPeriod);

let doDeleteFiscalPeriod = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let fiscalPeriod;

        // Validate
        function getFiscalPeriod() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "GET",
                    name: "FiscalPeriod",
                    id: obj.id,
                    client: obj.client
                };

                function callback(resp) {
                    if (fiscalPeriod.status === "C") {
                        reject("Can not delete a closed period.");
                        return;
                    }

                    if (fiscalPeriod.status === "F") {
                        reject("Can not delete a frozen period.");
                        return;
                    }

                    fiscalPeriod = resp;
                    resolve();
                }

                f.datasource.request(payload, true).then(
                    callback
                ).catch(
                    reject
                );
            });
        }

        function getNextFiscalPeriod() {
            return new Promise(function (resolve, reject) {
                let payload = {
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
                        reject(
                            "Can not delete a period with a subsequent period."
                        );
                        return;
                    }

                    resolve();
                }

                f.datasource.request(payload, true).then(
                    callback
                ).catch(
                    reject
                );
            });
        }

        function getTrialBalances() {
            return new Promise(function (resolve, reject) {
                let payload = {
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
                        if (
                            trialBalance.debits !== 0 ||
                            trialBalance.credits !== 0
                        ) {
                            reject(
                                "Can not delete period with trial balance " +
                                "activity posted."
                            );
                            return;
                        }
                    });

                    resolve(resp);
                }

                f.datasource.request(payload, true).then(
                    callback
                ).catch(
                    reject
                );
            });
        }

        function doDeleteTrialBalances(resp) {
            return new Promise(function (resolve, reject) {
                let deletions;

                // Build array of deletion calls
                deletions = resp.map(function (trialBalance) {
                    let payload = {
                        method: "DELETE",
                        name: "TrialBalance",
                        client: obj.client,
                        id: trialBalance.id
                    };

                    return f.datasource.request(payload, true);
                });

                Promise.all(deletions).then(resolve).catch(reject);
            });
        }

        Promise.resolve().then(
            getFiscalPeriod
        ).then(
            getNextFiscalPeriod
        ).then(
            getTrialBalances
        ).then(
            doDeleteTrialBalances
        ).then(
            resolve.bind(null, true)
        ).catch(
            reject
        );
    });
};

f.datasource.registerFunction(
    "DELETE",
    "FiscalPeriod",
    doDeleteFiscalPeriod,
    f.datasource.TRIGGER_AFTER
);
