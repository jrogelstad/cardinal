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

function doAfterInsertLedgerAccount(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let periods;
        let prev;
        let currency;
        let account = obj.newRec;
        let period = null;

        function createTrialBalance() {
            return new Promise(function (resolve, reject) {
                let payload;

                if (!periods.length) {
                    resolve();
                    return;
                }

                prev = period;
                period = periods.shift();
                payload = {
                    method: "POST",
                    name: "TrialBalance",
                    client: obj.client,
                    data: {
                        code: account.code + " - " + period.name,
                        currency: currency,
                        parent: account,
                        period: period,
                        previous: prev,
                        balance: {
                            currency: currency.code,
                            amount: 0
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

                Promise.resolve().then(
                    f.datasource.request.bind(null, payload, true)
                ).then(
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
                if (!resp.length) {
                    reject("No base currency found");
                    return;
                }

                currency = resp[0];
                resolve();
            }

            f.datasource.request(payload, true).then(
                callback
            ).catch(
                reject
            );
        });

        let getFiscalPeriod = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "FiscalPeriod",
                client: obj.client,
                filter: {
                    order: [{
                        property: "start"
                    }]
                }
            };

            function callback(resp) {
                periods = resp;
                resolve();
            }

            f.datasource.request(payload, true).then(
                callback
            ).catch(
                reject
            );
        });

        function updateParent(parent) {
            return new Promise(function (resolve, reject) {
                if (!parent) {
                    reject("Parent not found.");
                    return;
                }

                if (parent.isUsed) {
                    reject(
                        "Account used in transactions may not become a parent."
                    );
                    return;
                }

                let payload = {
                    method: "POST",
                    name: "LedgerAccount",
                    client: obj.client,
                    id: parent.id,
                    data: parent
                };

                if (!parent.isParent) {
                    parent.isParent = true;

                    f.datasource.request(payload, true).then(
                        resolve
                    ).catch(
                        reject
                    );

                    return;
                }

                resolve();
            });
        }

        function getParent() {
            return new Promise(function (resolve, reject) {
                if (
                    account.parent &&
                    account.parent.id !== undefined &&
                    account.parent.id !== null
                ) {
                    let payload = {
                        method: "GET",
                        name: "LedgerAccount",
                        client: obj.client,
                        id: account.parent.id
                    };

                    f.datasource.request(payload, true).then(
                        updateParent
                    ).then(
                        resolve
                    ).catch(
                        reject
                    );

                    return;
                }

                resolve();
            });
        }

        Promise.all([
            getCurrency,
            getFiscalPeriod
        ]).then(
            createTrialBalance
        ).then(
            getParent
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "POST",
    "LedgerAccount",
    doAfterInsertLedgerAccount,
    f.datasource.TRIGGER_AFTER
);

function doBeforeDeleteLedgerAccount(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let parentId;

        function checkAccount() {
            return new Promise(function (resolve) {
                if (obj.oldRec.isParent) {
                    throw new Error("Can not delete a parent account.");
                }

                if (obj.oldRec.isUsed) {
                    throw new Error(
                        "Can not delete a ledger account that has been used."
                    );
                }

                if (obj.oldRec.parent !== null) {
                    parentId = obj.oldRec.parent.id;
                }

                resolve();
            });
        }

        function getChildren() {
            return new Promise(function (resolve, reject) {
                if (parentId) {
                    let payload = {
                        method: "GET",
                        name: "LedgerAccount",
                        client: obj.client,
                        properties: ["id"],
                        filter: {
                            criteria: [
                                {
                                    property: "parent.id",
                                    value: parentId
                                },
                                {
                                    property: "id",
                                    operator: "!=",
                                    value: obj.id
                                }
                            ]
                        }
                    };

                    f.datasource.request(payload, true).then(
                        resolve
                    ).catch(
                        reject
                    );

                    return;
                }

                resolve();
            });
        }

        function getParent(children) {
            return new Promise(function (resolve, reject) {
                if (!children.length) {
                    let payload = {
                        method: "GET",
                        name: "LedgerAccount",
                        client: obj.client,
                        id: parentId
                    };

                    f.datasource.request(payload, true).then(
                        resolve
                    ).catch(
                        reject
                    );

                    return;
                }

                resolve();
            });
        }

        function updateParent(parent) {
            return new Promise(function (resolve, reject) {
                if (!parent) {
                    resolve();
                    return;
                }

                let payload = {
                    method: "POST",
                    name: "LedgerAccount",
                    client: obj.client,
                    id: parentId,
                    data: parent
                };

                parent.isParent = false;

                f.datasource.request(payload, true).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        function getTrialBalance() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "GET",
                    name: "TrialBalance",
                    client: obj.client,
                    properties: ["id"],
                    filter: {
                        criteria: [{
                            property: "parent.id",
                            value: obj.id
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

        function deleteTrialBalance(trialBalances) {
            return new Promise(function (resolve, reject) {
                let requests = trialBalances.map(function (balance) {
                    let payload = {
                        method: "DELETE",
                        name: "TrialBalance",
                        client: obj.client,
                        id: balance.id
                    };

                    return f.datasource.request(payload, true);
                });

                Promise.all(requests).then(resolve).catch(reject);
            });
        }

        Promise.resolve().then(
            checkAccount
        ).then(
            getChildren
        ).then(
            getParent
        ).then(
            updateParent
        ).then(
            getTrialBalance
        ).then(
            deleteTrialBalance
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "DELETE",
    "LedgerAccount",
    doBeforeDeleteLedgerAccount,
    f.datasource.TRIGGER_BEFORE
);

