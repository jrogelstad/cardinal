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
/*jslint this*/
(function () {
    "use strict";

    var catalog = require("catalog"),
        model = require("model"),
        list = require("list"),
        dataSource = require("datasource"),
        models = catalog.register("models"),
        ltFeather = catalog.getFeather("LedgerTransaction"),
        jdFeather = catalog.getFeather("LedgerDistribution"),
        laFeather = catalog.getFeather("LedgerAccount"),
        f = require("common-core");

    // Create ledger transaction model
    models.ledgerTransaction = function (data, feather) {
        feather = feather || ltFeather;
        var that;

        // Set default currency attribute
        feather.properties.currency.default = f.baseCurrency;

        that = model(data, feather);

        // Sync currency
        function update() {
            var value,
                dist = that.data.distributions(),
                code = that.data.currency().data.code(),
                minorUnit = that.data.currency().data.minorUnit(),
                total = that.data.amount();

            // Update distributions
            code = that.data.currency().data.code();

            dist.forEach(function (item) {
                if (item.data.debit().currency !== code) {
                    value = f.copy(item.data.debit());
                    value.currency = code;
                    item.data.debit(value);
                }
                if (item.data.credit().currency !== code) {
                    value = f.copy(item.data.credit());
                    value.currency = code;
                    item.data.credit(value);
                }
            });

            // Update total
            if (total.currency !== code) {
                total.currency = code;
            }

            total.amount = 0;
            dist.forEach(function (item) {
                if (item.state().current()[0] !== "/Delete") {
                    total.amount = Math.add(total.amount,
                            item.data.debit().amount, minorUnit);
                }
            });

            that.data.amount(total);
        }

        that.onChanged("currency", update);
        that.onChanged("distributions", update);
        that.onChanged("distributions.debit", update);
        that.onChanged("distributions.credit", update);
        that.state().resolve("/Ready/Fetched/Clean").enter(function () {
            if (that.data.isPosted()) {
                that.isReadOnly(true);
                that.state().goto("/Ready/Fetched/ReadOnly");
            }
        });

        // Can't delete posted journals
        that.onCanDelete(function () {
            return !that.data.isPosted();
        });

        function sum(total, item) {
            if (item.debit.amount) {
                return Math.subtract(
                    total,
                    item.debit.amount
                );
            } else {
                return Math.add(
                    total,
                    item.credit.amount
                );
            }
        }

        that.onValidate(function () {
            var dist = that.data.distributions().toJSON();

            if (!dist.length) {
                throw "There are no distributions.";
            }

            if (dist.reduce(sum, 0) !== 0) {
                throw "Journal entries must sum to zero.";
            }

        });

        // Return instantiated model
        return that;
    };

    models.ledgerTransaction.list = list("LedgerTransaction");

    // Create ledger distribution model
    models.ledgerDistribution = function (data, feather) {
        feather = feather || jdFeather;
        var that = model(data, feather);

        that.onChange("debit", function (prop) {
            var debit = prop.newValue.toJSON(),
                credit = that.data.credit.toJSON();

            if (debit.amount < 0) {
                debit.amount = 0;
                prop(f.copy(debit));
            } else if (debit.amount && credit.amount) {
                credit.amount = 0;
                that.data.credit(f.copy(credit));
            }
        });

        that.onChange("credit", function (prop) {
            var credit = prop.newValue.toJSON(),
                debit = that.data.debit.toJSON();

            if (credit.amount < 0) {
                credit.amount = 0;
                prop(f.copy(credit));
            } else if (credit.amount && debit.amount) {
                debit.amount = 0;
                that.data.debit(f.copy(debit));
            }
        });

        that.onValidate(function () {
            if (that.data.debit().amount - 0 === 0 &&
                    that.data.credit().amount - 0 === 0) {
                throw "Debit or credit must be positive on every distribution.";
            }
        });

        return that;
    };

    models.ledgerDistribution.list = list("LedgerDistribution");

    // Private helper to consolidate logic
    function post(ids, viewModel, message, unposted) {
        var dialog = viewModel.confirmDialog(),
            payload = {
                method: "POST",
                path: "/ledger/post-journals",
                data: {
                    ids: ids
                }
            },
            callback = function () {
                unposted.forEach(function (model) {
                    model.fetch();
                });
            },
            error = function (err) {
                dialog.message(err.message);
                dialog.title("Error");
                dialog.icon("exclamation-triangle");
                dialog.onOk(undefined);
                dialog.show();
            };

        dialog.message(message);
        dialog.icon("question-circle");
        dialog.onOk(function () {
            dataSource.request(payload)
                .then(callback)
                .catch(error);
        });
        dialog.show();
    }

    // Static functions
    models.journal.post = function (viewModel) {
        var message = "Are you sure you want to post the selected journals?",
            unposted = viewModel.tableWidget().selections().filter(function (model) {
                return !model.data.isPosted();
            }),
            ids = unposted.map(function (model) {
                return model.id();
            });

        if (!ids.length) {
            return;
        }

        post(ids, viewModel, message, unposted);
    };
    models.journal.postAll = function (viewModel) {
        var message = "Are you sure you want to post all unposted journals?",
            // Have to do this first because we made filter do something else on lists!
            ary = viewModel.tableWidget().models().map(function (model) {
                return model;
            }),
            unposted = ary.filter(function (model) {
                return !model.data.isPosted();
            });

        post(null, viewModel, message, unposted);
    };
    models.journal.postCheck = function (selections) {
        return selections.some(function (model) {
            return !model.data.isPosted();
        });
    };

    // Create ledger account model
    models.ledgerAccount = function (data, feather) {
        feather = feather || laFeather;
        var that = model(data, feather);

        that.onCanDelete(function () {
            return !that.data.isUsed() && !that.data.isParent();
        });

        that.onValidate(function () {
            var parent = that.data.parent();

            if (parent && parent.data.isUsed()) {
                throw "Account used in transactions may not become a parent.";
            }
        });

        // Return instantiated model
        return that;
    };

    models.ledgerAccount.list = list("LedgerAccount");

}());