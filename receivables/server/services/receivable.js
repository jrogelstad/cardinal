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

    function calculateTotals(obj) {
        return new Promise(function (resolve, reject) {
            var data = obj.newRec;

            if (!data.currency) {
                throw "Currency is required for receivable";
            }

            function getCurrency() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "Currency",
                        id: data.currency.id,
                        client: obj.client
                    };

                    datasource.request(payload, true)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function calculate(currency) {
                var lines;

                if (!currency) {
                    throw "Currency not found";
                }

                data.subtotal = {
                    amount: 0,
                    currency: currency.code
                };

                data.total = {
                    amount: 0,
                    currency: currency.code
                };

                if (!data.freight) {
                    data.freight = {
                        amount: 0,
                        currency: currency.code
                    };
                }

                if (!data.tax) {
                    data.tax = {
                        amount: 0,
                        currency: currency.code
                    };
                }

                // Exclude deleted
                lines = data.lines.filter((line) => line !== undefined);
                lines.forEach(function (line) {
                    if (line.billed === undefined) {
                        throw "Billed quantity is required.";
                    }

                    if (!line.price) {
                        line.price = {
                            amount: 0,
                            currency: currency.code
                        };
                    }

                    line.extended = {
                        amount: 0,
                        currency: currency.code
                    };

                    line.extended.amount = line.billed
                        .times(line.price.amount)
                        .round(data.currency.minorUnit);

                    data.subtotal.amount = data.subtotal.amount
                        .plus(line.extended.amount);
                });

                data.total.amount = data.freight.amount
                    .plus(data.tax.amount)
                    .plus(data.subtotal.amount);

                resolve();
            }

            getCurrency()
                .then(calculate)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "Receivable", calculateTotals,
            datasource.TRIGGER_BEFORE);

    function doUpdateReceivable(obj) {
        return new Promise(function (resolve, reject) {
            if (obj.oldRec.isPosted) {
                throw new Error("Posted receivable may not be edited.");
            }

            calculateTotals(obj)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("PATCH", "Receivable", doUpdateReceivable,
            datasource.TRIGGER_BEFORE);

}(datasource));