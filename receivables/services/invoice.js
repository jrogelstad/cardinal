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

    /**
      Post a series of invoices and create journals.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Invoice data
      @param {Array} [payload.data.ids] Invoice ids to post. Default = all.
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostInvoices(obj) {
        return new Promise(function (resolve, reject) {
            var baseCurrency, categories, accountMaps, invoices,
                    getBaseCurrency, getIds, getCategories, getAccountMaps,
                    distributions = [],
                    journalId = f.createId();

            getBaseCurrency = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "baseCurrency",
                    client: obj.client
                };

                function callback(resp) {
                    baseCurrency = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            getCategories = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Category",
                    client: obj.client
                };

                function callback(resp) {
                    categories = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            getAccountMaps = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "AccountMap",
                    client: obj.client
                };

                function callback(resp) {
                    accountMaps = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            getIds = new Promise(function (resolve, reject) {
                // If ids were passed use those
                if (Array.isArray(obj.data.ids)) {
                    resolve(obj.data.ids);
                    return;
                }

                // Otherwise go get all unposted
                var payload = {
                    method: "GET",
                    name: "Invoice",
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
                    resolve(resp.map((row) => row.id));
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            function resolveAccount(type, category, site) {
                var found, currCategory;

                if (!type) {
                    throw new Error("No account mapping type specificed");
                }

                if (site && category) {
                    found = accountMaps.find((map) =>
                            map.type.code === type &&
                            map.type.category.id === category.id &&
                            map.type.site.id === site.id);
                } else if (site) {
                    found = accountMaps.find((map) =>
                            map.type.code === type &&
                            map.type.site.id === site.id);
                } else if (category) {
                    found = accountMaps.find((map) =>
                            map.type.code === type &&
                            map.type.category.id === category.id);
                } else {
                    found = accountMaps.find((map) =>
                            map.type.code === type);
                }

                if (found) {
                    if (found.account.isParent) {
                        throw new Error("Cannot post to parent account " + found.account.code +
                                " - " + found.account.description);
                    }

                    return found.account;
                }

                // Not found so traverse up to the parent and see if there's map there
                if (site && category) {
                    currCategory = categories.find((cat) => cat.id === category.id);

                    if (currCategory.parent) {
                        found = resolve(type, currCategory.parent, site);
                    } else {
                        return;
                    }

                    if (found) {
                        return found;

                    // No site and parent match, try category only
                    } else {
                        return resolve(type, category);
                    }
                }

                // No site, so try to find parent match only on category
                if (category) {
                    currCategory = categories.find((cat) => cat.id === category.id);

                    if (currCategory && currCategory.parent) {
                        return resolve(type, currCategory.parent);

                    // No category or parent match, try default map
                    } else {
                        return resolve(type);
                    }
                }

                // No more options...
                throw new Error("Can not resolve account type " + type);
            }

            function getInvoices(ids) {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "Invoice",
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

            function createJournal(resp) {
                var requests = [];

                invoices = resp;

                function distribute(debitType, debitCategory, debitSite,
                        creditType, creditCategory, creditSite,
                        currency, money, docDate) {
                    return new Promise(function (resolve, reject) {
                        var payload = {
                            method: "GET",
                            name: "convertCurrency",
                            data: {
                                fromCurrency: currency.code,
                                amount: money.amount,
                                effective: docDate
                            }
                        };

                        if (money.amount === 0) {
                            resolve();
                            return;
                        }

                        function callback(money) {
                            var found,
                                debitAccount = resolveAccount(debitType, debitCategory, debitSite),
                                creditAccount = resolveAccount(creditType, creditCategory, creditSite);

                            found = distributions.find((dist) =>
                                    dist.account.id === debitAccount.id &&
                                    dist.debit.amount > 0);

                            // Handle debit
                            if (found) {
                                found.debit.amount = found.debit.amount.plus(money.amount);
                            } else {
                                distributions.push({
                                    account: debitAccount,
                                    debit: money,
                                    credit: f.money(money.currency)
                                });
                            }

                            // Handle credit
                            found = distributions.find((dist) =>
                                    dist.account.id === creditAccount.id &&
                                    dist.credit.amount > 0);

                            if (found) {
                                found.credit.amount = found.credit.amount.plus(money.amount);
                            } else {
                                distributions.push({
                                    account: creditAccount,
                                    debit: f.money(money.currency),
                                    credit: money
                                });
                            }

                            resolve();
                        }

                        datasource.request(payload, true)
                            .then(callback)
                            .catch(reject);
                    });
                }

                function postJournal() {
                    return new Promise(function (resolve, reject) {
                        var payload = {
                            method: "POST",
                            name: "ReceivablesJournal",
                            data: {
                                id: journalId,
                                currency: baseCurrency,
                                date: obj.data.date,
                                distributions: distributions
                            }
                        };

                        datasource.request(payload, true)
                            .then(resolve)
                            .catch(reject);
                    });
                }

                // Create distributions for each document
                invoices.forEach(function (invoice) {
                    // Distribute freight
                    requests.push(distribute(
                        "Receivables",
                        invoice.customer.category,
                        invoice.site,
                        "Freight",
                        invoice.customer.category,
                        invoice.site,
                        invoice.currency,
                        invoice.freight,
                        invoice.docDate
                    ));

                    // Distribute tax
                    requests.push(distribute(
                        "Receivables",
                        invoice.customer.category,
                        invoice.site,
                        "Tax",
                        invoice.customer.category,
                        invoice.site,
                        invoice.currency,
                        invoice.tax,
                        invoice.docDate
                    ));

                    // Create distributions for each line
                    invoice.lines.forEach(function (line) {
                        requests.push(distribute(
                            "Receivables",
                            invoice.customer.category,
                            invoice.site,
                            "Revenue",
                            line.item.category,
                            line.item.site,
                            invoice.currency,
                            line.extended,
                            invoice.docDate
                        ));
                    });
                });

                Promise.all(requests)
                    .then(postJournal)
                    .then(resolve)
                    .catch(reject);
            }

            function updateInvoices() {
                return new Promise(function (resolve, reject) {
                    var requests = invoices.map(function (invoice) {
                        var payload = {
                            method: "POST",
                            name: "Invoice",
                            client: obj.client,
                            id: invoice.id,
                            data: invoice
                        };

                        invoice.isPosted = true;
                        invoice.status = "P";
                        invoice.journal = {
                            id: journalId
                        };

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

            Promise.all([
                getBaseCurrency,
                getCategories,
                getAccountMaps,
                getIds
            ])
                .then(getInvoices)
                .then(createJournal)
                .then(updateInvoices)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postInvoices", doPostInvoices);

    /**
      Post an invoice and create journal.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Invoice data
      @param {Object} [payload.data.id] Invoice id to post. Required
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostInvoice(obj) {
        return new Promise(function (resolve, reject) {
            if (!obj.data || !obj.data.id) {
                reject("Id must be provided");
                return;
            }

            obj.data.ids = [obj.data.id];
            delete obj.data.id;

            doPostInvoices(obj)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postInvoice", doPostInvoice);

}(datasource));