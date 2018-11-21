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
/*global require */
(function () {
    "strict";

    var catalog = require("catalog"),
        model = require("model"),
        list = require("list"),
        models = catalog.register("models"),
        f = require("component-core"),
        boFeather = catalog.getFeather("BillOrder"),
        tFeather = catalog.getFeather("Terms");

    /**
        Terms model
    */
    models.terms = function (data, feather) {
        feather = feather || tFeather;
        var that = model(data, feather),
            d = that.data;

        function handlePolicy() {
            var policy = d.policy();

            switch (policy) {
            case "P":
                d.isDepositRequired(true);
                d.depositPercent(100);
                d.depositAmount().amount = 0;
                d.net(0);
                d.day(1);
                d.discountDays(0);
                d.discount(0);
                d.net.isReadOnly(true);
                d.day.isReadOnly(true);
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.isDepositRequired.isReadOnly(true);
                break;
            case "I":
                d.net(0);
                d.day(1);
                d.discountDays(0);
                d.discount(0);
                d.net.isReadOnly(true);
                d.day.isReadOnly(true);
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.isDepositRequired.isReadOnly(false);
                break;
            case "N":
                d.day(1);
                d.day.isReadOnly(true);
                d.net.isReadOnly(false);
                d.discountDays.isReadOnly(false);
                d.discount.isReadOnly(false);
                d.isDepositRequired.isReadOnly(false);
                break;
            case "D":
                d.net(0);
                d.discountDays(0);
                d.discount(0);
                d.discountDays.isReadOnly(true);
                d.discount.isReadOnly(true);
                d.day.isReadOnly(false);
                d.net.isReadOnly(true);
                d.isDepositRequired.isReadOnly(false);
                break;
            default:
                throw new Error("Invalid terms policy.");
            }
        }

        function handleIsDepositRequired() {
            if (d.isDepositRequired()) {
                if (d.policy() === "P") {
                    d.depositAmount.isReadOnly(true);
                    d.depositPercent.isReadOnly(true);
                } else {
                    d.depositAmount.isReadOnly(false);
                    d.depositPercent.isReadOnly(false);
                }
            } else {
                if (d.depositAmount() && d.depositAmount().amount) {
                    d.depositAmount().amount = 0;
                } else {
                    d.depositAmount(f.money());
                }
                d.depositPercent(0);
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

            if (prop.newValue() === "N") {
                d.net(30);
            }
        });
        that.onChanged("policy", handlePolicy);
        that.onChanged("isDepositRequired", handleIsDepositRequired);
        that.state().resolve("/Ready/Fetched/Clean").enter(function () {
            handlePolicy();
            handleIsDepositRequired();
        });

        that.onValidate(function () {
            if (d.isDepositRequired() && d.depositAmount.toJSON().amount === 0 && d.depositPercent.toJSON() === 0) {
                throw "Deposit percent or amount must be positive when deposit required.";
            }
        });

        handlePolicy();
        handleIsDepositRequired();

        return that;
    };

    models.terms.list = list("Terms");

     /**
        Bill order model
    */
    models.billOrder = function (data, feather) {
        feather = feather || boFeather;
        var that = model(data, feather),
            d = that.data;

        function handleLineNumber() {
            var count = d.lines().length;

            d.lines().some(function (line) {
                if (!line.data.number()) {
                    return line.data.number(count);
                }
            });
        }

        function handleBillEntity() {
            var billEntity = d.billEntity();

            if (billEntity) {
                d.billTo(billEntity.data.billTo());
                d.contact(billEntity.data.contact());
                d.currency(billEntity.data.currency());
                d.terms(billEntity.data.terms());
                d.taxType(billEntity.data.taxType());
            }
        }

        that.onChanged("lines", handleLineNumber);
        that.onChanged("billEntity", handleBillEntity);

        that.onValidate(function () {
            if (!d.lines().length) {
                throw "At least one line item is required";
            }
        });

        return that;
    };

    models.billOrder.list = list("BillOrder");

}());
