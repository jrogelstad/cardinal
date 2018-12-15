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
            var itemCategories, accountMaps,
                    getIds, getItemCategories, getAccountMaps,
                    distributions = [];

            getItemCategories = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "ItemCategory",
                    client: obj.client
                };

                function callback(resp) {
                    itemCategories = resp;
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
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "type.code",
                            operator: "IN",
                            value: ["AR", "Revenue"]
                        }]
                    }
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

            function resolveAccount(type, category) {
                var found, itemCategory;

                found = accountMaps.find((map) =>
                        map.type.code === type &&
                        map.type.category.id === category.id);

                if (found) {
                    return found.account;
                }

                // Not found so traverse up to the parent and see if there's map there
                itemCategory = itemCategories.find((cat) => cat.id === category.id);

                if (itemCategory && itemCategory.parent) {
                    return resolve(type, itemCategory.parent);
                }

                throw new Error("Can not resolve account type " + type + " for category " + category.code);
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

            function createJournals(invoices) {
                var currCode, payload,
                        requests = [];

                invoices.forEach(function (invoice) {
                    currCode = invoice.currency.code;
                    invoice.lines.forEach(function (line) {
                        var convert = new Promise(function (resolve, reject) {
                            var cpayload = {
                                method: "GET",
                                name: "convertCurrency",
                                data: {
                                    fromCurrency: currCode,
                                    amount: line.extended.amount,
                                    effective: invoice.docDate
                                }
                            };

                            function callback(debit) {
                                var found,
                                    credit = f.copy(debit), // Copy so no accidental reference updates
                                    arAccount = resolveAccount("AR", line.item.category),
                                    revAccount = resolveAccount("Revenue", line.item.category);

                                // Handle AR account
                                found = distributions.find((dist) =>
                                        dist.glAccount.id === arAccount.id &&
                                        dist.debit.amount > 0);

                                if (found) {
                                    found.debit.amount = found.debit.amount.plus(debit.amount);
                                } else {
                                    dist.push({
                                        account: arAccount,
                                        debit: debit,
                                        credit: f.money(credit.currency)
                                    });
                                }

                                // Handle Revenue account
                                found = distributions.find((dist) =>
                                        dist.glAccount.id === revAccount.id &&
                                        dist.credit.amount > 0);

                                if (found) {
                                    found.credit.amount = found.credit.amount.plus(credit.amount);
                                } else {
                                    dist.push({
                                        account: revAccount,
                                        debit: f.money(debit.currency),
                                        credit: credit
                                    });
                                }

                                resolve();
                            }

                            datasource.request(cpayload, true)
                                .then(callback)
                                .catch(reject);
                        });

                        requests.push(convert);
                    });
                });

                Promise.all(requests)
                    .then(resolve)
                    .catch(reject);
            }

            function updateInvoice() {
                return new Promise(function (resolve, reject) {
                    var requests;

                    requests = journals.map(function (invoice) {
                        var payload = {
                            method: "POST",
                            name: "Invoice",
                            client: obj.client,
                            id: invoice.id,
                            data: invoice
                        };

                        invoice.isPosted = true;
                        invoice.journal = {
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
                getItemCategories,
                getAccountMaps,
                getIds
            ])
                .then(getInvoices)
                .then(createJournals)
                .then(updateInvoice)
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