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
(function () {
    "use strict";

    const catalog = require("catalog");
    const model = require("model");
    const list = require("list");
    const dataSource = require("datasource");
    const models = catalog.register("models");
    const f = require("common-core");
    const postMixin = catalog.store().mixins().post;

    // Create bill subledger model
    models.billSubledger = function (data, feather) {
        feather = feather || catalog.getFeather("BillSubledger");
        var that = model(data, feather);

        that.state().resolve("/Ready/Fetched/Clean").enter(function () {
            if (that.data.isPosted()) {
                this.goto("../ReadOnly");
            }
        });

        return that;
    };

    models.billSubledger.list = list("BillSubledger");

    models.fiscalPeriod.closeCheck = function (selections) {
        return selections.every(function (model) {
            return model.data.status() !== "C" &&
                    (!model.data.previous() || model.data.previous().data.status() === "C");
        });
    };

    models.fiscalPeriod.openCheck = function (selections) {
        return selections.every(function (model) {
            return model.data.status() === "C" &&
                    (!model.data.next() || model.data.next().data.status() !== "C");
        });
    };

    function changePeriodStatus(viewModel, action) {
        var dialog = viewModel.confirmDialog(),
            selected = viewModel.tableWidget().selections()[0],
            payload = {
                method: "POST",
                path: "/ledger/" + action,
                data: {
                    id: selected.id()
                }
            },
            callback = function () {
                viewModel.tableWidget().refresh();
            },
            error = function (err) {
                dialog.message(err.message);
                dialog.title("Error");
                dialog.icon("exclamation-triangle");
                dialog.onOk(undefined);
                dialog.buttonCancel().hide();
                dialog.show();
            };

        dataSource.request(payload)
            .then(callback)
            .catch(error);
    }

    models.fiscalPeriod.close = function (viewModel) {
        changePeriodStatus(viewModel, "close-fiscal-period");
    };

    models.fiscalPeriod.open = function (viewModel) {
        changePeriodStatus(viewModel, "open-fiscal-period");
    };

    // Create ledger transaction model
    models.ledgerTransaction = function (data, feather) {
        feather = feather || catalog.getFeather("LedgerTransaction");
        var that;

        // Set default currency attribute
        feather.properties.currency.default = f.baseCurrency;

        that = model(data, feather);

        // Sync currency
        function update() {
            var value,
                dist = that.data.distributions(),
                code = that.data.currency().data.code(),
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
                    total.amount = total.amount.plus(item.data.debit().amount);
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
                return total.minus(item.debit.amount);
            } else {
                return total.plus(item.credit.amount);
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
        feather = feather || catalog.getFeather("LedgerDistribution");
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

    // Create ledger account model
    models.ledgerAccount = function (data, feather) {
        feather = feather || catalog.getFeather("LedgerAccount");
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

    // Add static post functions to Journal
    postMixin("GeneralJournal", "Ledger");

}());