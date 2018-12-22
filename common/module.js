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
/*global require*/
/*jslint es6*/
(function () {
    "strict";

    const catalog = require("catalog");
    const model = require("model");
    const list = require("list");
    const models = catalog.register("models");
    const f = require("component-core");
    const datasource = require("datasource");

    /**
        Terms model
    */
    models.terms = function (data, feather) {
        feather = feather || catalog.getFeather("Terms");
        var that = model(data, feather),
            d = that.data;

        function handleReadOnly() {
            switch (d.policy()) {
            case "P":
                d.net.isReadOnly(true);
                d.day.isReadOnly(true);
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.isDepositRequired.isReadOnly(true);
                break;
            case "I":
                d.net.isReadOnly(true);
                d.day.isReadOnly(true);
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.isDepositRequired.isReadOnly(false);
                break;
            case "N":
                d.day.isReadOnly(true);
                d.net.isReadOnly(false);
                d.discountDays.isReadOnly(false);
                d.discount.isReadOnly(false);
                d.isDepositRequired.isReadOnly(false);
                break;
            case "D":
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.day.isReadOnly(false);
                d.net.isReadOnly(true);
                d.isDepositRequired.isReadOnly(false);
                break;
            default:
                throw new Error("Invalid terms policy.");
            }

            if (d.isDepositRequired()) {
                if (d.policy() === "P") {
                    d.depositAmount.isReadOnly(true);
                    d.depositPercent.isReadOnly(true);
                } else {
                    d.depositAmount.isReadOnly(false);
                    d.depositPercent.isReadOnly(false);
                }
            } else {
                d.depositAmount.isReadOnly(true);
                d.depositPercent.isReadOnly(true);
            }
        }

        that.onChange("day", function (prop) {
            if (prop.newValue() < 1) {
                prop.newValue(1);
            } else if (prop.newValue() > 31) {
                prop.newValue(31);
            }
        });

        that.onChange("policy", function (prop) {
            if (prop.oldValue() === "P") {
                d.isDepositRequired(false);
                d.depositPercent(0);
            }

            switch (prop.newValue()) {
            case "P":
                d.isDepositRequired(true);
                d.depositPercent(100);
                d.depositAmount().amount = 0;
                d.net(0);
                d.day(1);
                d.discountDays(0);
                d.discount(0);
                break;
            case "I":
                d.net(0);
                d.day(1);
                d.discountDays(0);
                d.discount(0);
                break;
            case "N":
                d.net(30);
                d.day(1);
                break;
            case "D":
                d.net(0);
                d.discountDays(0);
                d.discount(0);
                break;
            default:
                throw new Error("Invalid terms policy.");
            }
        });

        that.onChanged("isDepositRequired", function () {
            if (!d.isDepositRequired()) {
                if (d.depositAmount() && d.depositAmount.toJSON().amount) {
                    d.depositAmount().amount = 0;
                } else {
                    d.depositAmount(f.money());
                }
                d.depositPercent(0);
            }
        });

        that.onChanged("policy", handleReadOnly);
        that.onChanged("isDepositRequired", handleReadOnly);
        that.state().resolve("/Ready/Fetched/Clean").enter(handleReadOnly);

        that.onValidate(function () {
            if (d.isDepositRequired() && d.depositAmount.toJSON().amount === 0 && d.depositPercent.toJSON() === 0) {
                throw "Deposit percent or amount must be positive when deposit required.";
            }
        });

        handleReadOnly();

        return that;
    };

    models.terms.list = list("Terms");

    function currencyCode(d) {
        return d.currency()
            ? d.currency().data.code()
            : undefined;
    }

    /**
        Bill order model
    */
    models.billOrder = function (data, feather) {
        feather = feather || catalog.getFeather("BillOrder");
        var that = model(data, feather),
            d = that.data;

        function calculateTotal() {
            var amount,
                result = f.money(0, currencyCode(d)),
                subtotal = d.subtotal.toJSON().amount,
                freight = d.freight.toJSON().amount,
                tax = d.tax.toJSON().amount;

            amount = subtotal.plus(freight).plus(tax);
            result.amount = amount;
            d.total(result);
        }

        that.onChanged("billEntity", function () {
            var billTo,
                billEntity = d.billEntity();

            if (billEntity) {
                billTo = f.copy(billEntity.data.billTo.toJSON());
                billTo.id = f.createId();
                d.billTo(billTo);
                d.site(billEntity.data.site());
                d.contact(billEntity.data.contact());
                d.currency(billEntity.data.currency());
                d.terms(billEntity.data.terms());
                d.taxType(billEntity.data.taxType());
            }
        });

        that.onChanged("currency", function () {
            var money,
                curr = currencyCode(d);

            if (curr) {
                money = [
                    d.subtotal,
                    d.freight,
                    d.tax,
                    d.total
                ];

                money.forEach(function (fn) {
                    var ret = f.copy(fn());

                    ret.currency = curr;
                    fn(ret);
                });
            }
        });

        that.onChanged("subtotal", calculateTotal);
        that.onChanged("freight", calculateTotal);
        that.onChanged("tax", calculateTotal);

        return that;
    };

    models.billOrder.list = list("BillOrder");


     /**
        Order line model
    */
    models.orderLine = function (data, feather) {
        feather = feather || catalog.getFeather("OrderLine");
        var that = model(data, feather),
            d = that.data;

        that.onChanged("item", function () {
            var site,
                item = d.item();

            if (item) {
                d.price(item.data.price());
                site = that.parent().data.site();
                if (site) {
                    d.site(site);
                }
            }
        });

        return that;
    };

    models.orderLine.list = list("OrderLine");

    /**
        Order header mixin

        Applies shared line item logic to orders

        @param {Object} Order model instance
        @returns {Object} order model instance
    */
    function orderHeader(model) {
        var d = model.data;

        function handleReadOnly() {
            var count,
                billEntity = d.billEntity();

            // Can't change bill entity once lines created
            if (billEntity) {
                count = d.lines().reduce(function (total, item) {
                    if (item.state().current()[0] !== "/Delete") {
                        return total + 1;
                    }

                    return total;
                }, 0);

                d.lines().canAdd(true);
                d.billEntity.isReadOnly(count > 0);
            } else {
                d.lines().canAdd(false);
                d.billEntity.isReadOnly(false);
            }
        }

        model.onChanged("currency", function () {
            var money = [],
                curr = currencyCode(d);

            if (curr) {
                d.lines().forEach(function (line) {
                    money.push(line.data.price);
                    money.push(line.data.extended);
                });

                money.forEach(function (fn) {
                    var ret = f.copy(fn());

                    ret.currency = curr;
                    fn(ret);
                });
            }
        });

        model.onChanged("lines", function () {
            var count;

            // Set line number if applicable
            count = d.lines().length;

            d.lines().some(function (line) {
                if (!line.data.number()) {
                    return line.data.number(count);
                }
            });
        });

        model.onChange("lines.extended", function (prop) {
            var result = f.money(0, currencyCode(d));

            result.amount = d.subtotal.toJSON().amount
                .minus(prop.oldValue.toJSON().amount)
                .plus(prop.newValue.toJSON().amount);

            d.subtotal(result);
        });

        model.onChanged("billEntity", handleReadOnly);
        model.onChanged("lines", handleReadOnly);
        model.state().resolve("/Ready/Fetched/Clean").enter(handleReadOnly);

        model.onValidate(function () {
            if (!d.lines().length) {
                throw "At least one line item is required";
            }

            if (d.lines().some(function (line) {
                return line.data.ordered.toJSON() <= 0;
            })) {
                throw "Line quantities must be greater than zero.";
            }
        });

        // Initialize
        handleReadOnly();

        return model;
    }

    catalog.register("mixins", "orderHeader", orderHeader);

    /**
        Post logic mixin

        Applies posting static functions to model factory to be
        triggered by action menus:

            * Post: Post selected documents
            * PostAll: Post all documents
            * PostCheck: Check posting eligibility

        @param {String} Feather class name
        @param {String} Module name
        @returns {Object} Model factory
    */
    function postMixin(type, module) {
        module = module.toSnakeCase();

        var factory = models[type.toCamelCase()],
            feather = catalog.getFeather(type),
            name = feather.plural;

        // Private helper to consolidate logic
        function post(ids, viewModel, message) {
            var dialog = viewModel.confirmDialog(),
                payload = {
                    method: "POST",
                    path: "/" + module + "/post-" + name.toSnakeCase(),
                    data: {
                        ids: ids
                    }
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
                datasource.request(payload)
                    .catch(error);
            });
            dialog.show();
        }

        // Static functions
        factory.post = function (viewModel) {
            var message = "Are you sure you want to post the selected " + name.toProperCase() + "?",
                unposted = viewModel.tableWidget().selections().filter(function (model) {
                    return !model.data.isPosted();
                }),
                ids = unposted.map(function (model) {
                    return model.id();
                });

            if (!ids.length) {
                return;
            }

            post(ids, viewModel, message);
        };
        factory.postAll = function (viewModel) {
            var message = "Are you sure you want to post all unposted " + name.toProperCase() + "?";

            post(null, viewModel, message);
        };
        factory.postCheck = function (selections) {
            return selections.some(function (model) {
                return !model.data.isPosted();
            });
        };
    }

    catalog.register("mixins", "post", postMixin);

}());
