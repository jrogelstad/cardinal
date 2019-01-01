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

    /**
      Journal delete handler
    */
    function doDeleteJournal(obj) {
        return new Promise(function (resolve) {
            if (obj.oldRec.isPosted) {
                throw new Error("Can not delete a posted journal.");
            }

            resolve();
        });
    }

    datasource.registerFunction("DELETE", "Journal", doDeleteJournal,
            datasource.TRIGGER_BEFORE);

    /**
      Post a series of journals and update trial balance.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Journal data
      @param {Array} [payload.data.ids] Journal ids to post. Default = all.
      @param {String} [payload.data.feather] Type of journal. Default = "Journal".
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostJournals(obj) {
        return new Promise(function (resolve, reject) {
            var afterLedgerAccounts, kind, currency, journals, transaction, profitLossIds, balanceSheetIds,
                    data = obj.data,
                    date = data.date || f.today(),
                    ledgerAccounts = {},
                    ledgerAccountIds = [],
                    distributions = [],
                    trialBalances = [],
                    profitLossDist = {},
                    balanceSheetDist = {};

            // Helper functions
            function compute(transDist, dist) {
                var amount = transDist.credit.amount
                    .minus(transDist.debit.amount)
                    .plus(dist.credit.amount)
                    .minus(dist.debit.amount);

                if (amount > 0) {
                    transDist.credit.amount = amount;
                    transDist.debit.amount = 0;
                } else {
                    transDist.credit.amount = 0;
                    transDist.debit.amount = amount * -1;
                }
            }

            function getIds() {
                return new Promise(function (resolve, reject) {
                    if (Array.isArray(obj.data.ids)) {
                        resolve(obj.data.ids);
                        return;
                    }

                    var payload = {
                        method: "GET",
                        name: obj.data.feather || "Journal",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "isPosted",
                                operator: "=",
                                value: false
                            }]
                        }
                    };

                    function callback(resp) {
                        data.ids = resp.map(function (row) {
                            return row.id;
                        });

                        resolve(data.ids);
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function getParents(id, ary) {
                ary = ary || [];
                var ledgerAccount;

                ary.push(id);

                ledgerAccount = ledgerAccounts[id];

                if (ledgerAccount.parent) {
                    getParents(ledgerAccount.parent.id, ary);
                }

                return ary;
            }

            // Promise functions
            function getJournals(ids) {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "Journal",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "id",
                                operator: "IN",
                                value: ids
                            }]
                        }
                    };

                    datasource.request(payload, true)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function afterJournals(resp) {
                return new Promise(function (resolve, reject) {
                    if (resp.length !== data.ids.length) {
                        reject("Journal(s) not found.");
                        return;
                    }

                    journals = resp;

                    // Build list of accounts and distribution data
                    journals.forEach(function (journal) {
                        if (kind && kind.id !== journal.currency.id) {
                            throw new Error("Journals must all be in the same currency.");
                        }
                        kind = journal.currency;

                        if (journal.isPosted) {
                            throw new Error("Journal " + journal.number + " is already posted.");
                        }

                        journal.distributions.forEach(function (dist) {
                            var transDist,
                                accountId = dist.account.id;

                            if (dist.account.type === "R" ||
                                    dist.account.type === "E") {
                                transDist = profitLossDist[accountId];
                                if (transDist) {
                                    compute(transDist, dist);
                                } else {
                                    profitLossDist[accountId] = {
                                        id: f.createId(),
                                        account: dist.account,
                                        credit: {
                                            currency: journal.currency.code,
                                            amount: dist.credit.amount
                                        },
                                        debit: {
                                            currency: journal.currency.code,
                                            amount: dist.debit.amount
                                        }
                                    };
                                }
                            } else {
                                transDist = balanceSheetDist[accountId];
                                if (transDist) {
                                    compute(transDist, dist);
                                } else {
                                    balanceSheetDist[accountId] = {
                                        id: f.createId(),
                                        account: dist.account,
                                        credit: {
                                            currency: journal.currency.code,
                                            amount: dist.credit.amount
                                        },
                                        debit: {
                                            currency: journal.currency.code,
                                            amount: dist.debit.amount
                                        }
                                    };
                                }
                            }
                        });
                    });

                    // Build distributions and filter criteria
                    balanceSheetIds = Object.keys(balanceSheetDist);
                    balanceSheetIds.forEach(function (id) {
                        distributions.push(balanceSheetDist[id]);
                    });
                    ledgerAccountIds = ledgerAccountIds.concat(balanceSheetIds);

                    profitLossIds = Object.keys(profitLossDist);
                    profitLossIds.forEach(function (id) {
                        distributions.push(profitLossDist[id]);
                    });
                    ledgerAccountIds = ledgerAccountIds.concat(profitLossIds);

                    resolve(ledgerAccountIds);
                });
            }

            function getLedgerAccounts(ids) {
                return new Promise(function (resolve, reject) {
                    var payload;

                    if (ids.length) {
                        payload = {
                            method: "GET",
                            name: "LedgerAccount",
                            client: obj.client,
                            callback: afterLedgerAccounts,
                            filter: {
                                criteria: [{
                                    property: "id",
                                    operator: "IN",
                                    value: ids
                                }]
                            }
                        };

                        datasource.request(payload, true)
                            .then(afterLedgerAccounts)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }

                    resolve();
                });
            }

            afterLedgerAccounts = function (resp) {
                return new Promise(function (resolve, reject) {
                    ledgerAccountIds = [];

                    // Add parents to array of trial balance to update
                    resp.forEach(function (ledgerAccount) {
                        var id = ledgerAccount.id,
                            parentId = ledgerAccount.parent
                                ? ledgerAccount.parent.id
                                : false;
                        ledgerAccounts[ledgerAccount.id] = ledgerAccount;
                        if (parentId && ledgerAccountIds.indexOf(parentId) === -1) {
                            ledgerAccountIds.push(parentId);
                        }
                        if (ledgerAccount.type === "R" ||
                                ledgerAccount.type === "E") {
                            if (profitLossIds.indexOf(id) === -1) {
                                profitLossIds.push(id);
                            }
                        } else {
                            if (balanceSheetIds.indexOf(id) === -1) {
                                balanceSheetIds.push(id);
                            }
                        }
                    });

                    getLedgerAccounts(ledgerAccountIds)
                        .then(resolve)
                        .catch(reject);
                });
            };

            function getCurrency() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "Currency",
                        client: obj.client,
                        id: kind.id
                    };

                    function callback(resp) {
                        if (!resp) {
                            reject("Invalid currency.");
                            return;
                        }

                        currency = resp;
                        resolve();
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function getTrialBalance(ids, isBalanceSheet) {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "TrialBalance",
                        client: obj.client,
                        filter: {
                            criteria: [{
                                property: "currency",
                                value: currency
                            }, {
                                property: "parent.id",
                                operator: "IN",
                                value: ids
                            }, {
                                property: "period.end",
                                operator: ">=",
                                value: date
                            }, {
                                property: "period.status",
                                operator: "!=",
                                value: "Closed"
                            }],
                            sort: [{
                                property: "period.start",
                                value: "start"
                            }]
                        }
                    };

                    if (!isBalanceSheet) {
                        payload.filter.criteria.push({
                            property: "period.start",
                            operator: "<=",
                            value: date
                        });
                    }

                    function callback(resp) {
                        trialBalances = trialBalances.concat(resp);
                        resolve();
                    }

                    datasource.request(payload, true)
                        .then(callback)
                        .catch(reject);
                });
            }

            function getTrialBalances() {
                return new Promise(function (resolve, reject) {
                    var requests = [];

                    // Retrieve profit/loss trial balances
                    if (profitLossIds.length) {
                        requests.push(getTrialBalance(profitLossIds));
                    }

                    // Retrieve balance sheet trial balances
                    if (balanceSheetIds.length) {
                        requests.push(getTrialBalance(balanceSheetIds, true));
                    }

                    Promise.all(requests)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function postBalance() {
                return new Promise(function (resolve, reject) {
                    var requests = [];

                    // Post balance updates
                    distributions.forEach(function (dist) {
                        var value,
                            type = dist.account.type,
                            ids = getParents(dist.account.id),
                            debit = function (row) {
                                row.balance.amount = row.balance.amount.plus(value);
                            },
                            credit = function (row) {
                                row.balance.amount = row.balance.amount.minus(value);
                            };

                        // Iterate through trial balances for account and parents
                        ids.forEach(function (id) {
                            var update,
                                balances = trialBalances.filter(function (row) {
                                    return row.parent.id === id;
                                });

                            if (!balances.length) {
                                throw new Error("No open trial balance for account " + dist.account.code + ".");
                            }

                            if (type === "A" || type === "E") {
                                value = dist.debit.amount || dist.credit.amount * -1;

                                balances[0].debits.amount = balances[0].debits.amount.plus(value);

                                update = debit;
                            } else {
                                value = dist.credit.amount || dist.debit.amount * -1;

                                balances[0].credits.amount = balances[0].credits.amount.plus(dist.credit.amount);

                                update = credit;
                            }

                            balances.forEach(update);
                        });
                    });

                    // Add trial balance updates
                    requests = trialBalances.map(function (balance) {
                        var payload = {
                            method: "POST",
                            id: balance.id,
                            name: "TrialBalance",
                            client: obj.client,
                            data: balance
                        };

                        return datasource.request(payload, true);
                    });

                    // Create the GL transaction
                    var postGLTransaction = new Promise(function (resolve, reject) {
                        var payload;

                        transaction = {
                            currency: journals[0].currency,
                            date: date,
                            note: data.note,
                            distributions: distributions
                        };

                        payload = {
                            method: "POST",
                            name: "GeneralLedgerTransaction",
                            client: obj.client,
                            data: transaction
                        };

                        function callback(resp) {
                            jsonpatch.applyPatch(transaction, resp);
                            resolve();
                        }

                        datasource.request(payload, true)
                            .then(callback)
                            .catch(reject);
                    });

                    requests.push(postGLTransaction);

                    Promise.all(requests)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function updateJournal() {
                return new Promise(function (resolve, reject) {
                    var requests;

                    requests = journals.map(function (journal) {
                        var payload = {
                            method: "POST",
                            name: "Journal",
                            client: obj.client,
                            id: journal.id,
                            data: journal
                        };

                        journal.isPosted = true;
                        journal.folio = transaction.number;

                        return datasource.request(payload, true);
                    });

                    function callback() {
                        resolve(true);
                    }

                    Promise.all(requests)
                        .then(callback)
                        .catch(reject);
                });
            }

            Promise.resolve()
                .then(getIds)
                .then(getJournals)
                .then(afterJournals)
                .then(getLedgerAccounts)
                .then(getCurrency)
                .then(getTrialBalances)
                .then(postBalance)
                .then(updateJournal)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postJournals", doPostJournals);

    /**
      Post a journal and update trial balance.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Function} [payload.callback] callback.
      @param {Object} [payload.data] Journal data
      @param {Object} [payload.data.id] Journal id to post. Required
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostJournal(obj) {
        return new Promise(function (resolve, reject) {
            if (!obj.data || !obj.data.id) {
                reject("Id must be provided");
                return;
            }

            obj.data.ids = [obj.data.id];
            delete obj.data.id;

            doPostJournals(obj)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postJournal", doPostJournal);

}(datasource));