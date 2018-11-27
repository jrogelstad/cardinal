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
            var ids, currencies, baseCurrs, journals,
                    getIds, getCurrencies, getBaseCurrencies;

            getIds = new Promise(function (resolve, reject) {
                if (Array.isArray(obj.data.ids)) {
                    resolve(obj.data.ids);
                    return;
                }

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
                    ids = resp.map(function (row) {
                        return row.id;
                    });

                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            getCurrencies = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Currency",
                    client: obj.client
                };

                function callback(resp) {
                    currencies = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            getBaseCurrencies = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "BaseCurrency",
                    client: obj.client
                };

                function callback(resp) {
                    baseCurrs = resp;
                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            function byEffective(a, b) {
                var aEffect = a.data.effective(),
                    bEffect = b.data.effective();

                return aEffect > bEffect
                    ? -1
                    : 1;
            }

            function baseCurrency (effective) {
                effective = effective
                    ? new Date(effective).toDate()
                    : new Date().toDate();

                var current;

                baseCurrs.sort(byEffective);
                current = baseCurrs.find(function (item) {
                    return new Date(item.effective) <= effective;
                });
                current = current.currency.code;

                return currencies.find(function (currency) {
                    return currency.code === current;
                });
            }

            function getInvoices() {
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
                invoices.forEach(function (invoice) {
                    invoice.currency.id...
                    
                });
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
                getIds,
                getCurrencies,
                getBaseCurrencies
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