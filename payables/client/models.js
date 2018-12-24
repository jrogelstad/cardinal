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
/*jslint es6*/
(function () {
    "strict";

    const catalog = require("catalog");
    const model = require("model");
    const list = require("list");
    const f = require("component-core");
    const models = catalog.register("models");
    const postMixin = catalog.store().mixins().post;

     /**
        Invoice model
    */
    models.invoice = function (data, feather) {
        feather = feather || catalog.getFeather("Invoice");
        var that = model(data, feather),
            mixinOrderHeader = catalog.store().mixins().orderHeader;

        mixinOrderHeader(that);

        return that;
    };

    models.invoice.list = list("Invoice");

     /**
        Debit memo model
    */
    models.debitMemo = function (data, feather) {
        feather = feather || catalog.getFeather("CreditMemo");
        var that = model(data, feather),
            mixinOrderHeader = catalog.store().mixins().orderHeader;

        mixinOrderHeader(that);

        return that;
    };

    models.debitMemo.list = list("DebitMemo");

     /**
        Payable line model
    */
    models.payableLine = function (data, feather) {
        feather = feather || catalog.getFeather("PayableLine");
        var that = model(data, feather),
            d = that.data;

        function calculateExtended() {
            var currency = that.parent().data.currency().data.code(),
                amount = d.billed.toJSON().times(d.price.toJSON().amount);

            d.extended(f.money(amount, currency));
        }

        that.onChanged("ordered", function () {
            var ordered = d.ordered.toJSON();

            if (ordered > d.billed.toJSON()) {
                d.billed(ordered);
            }
        });

        that.onChanged("billed", calculateExtended);
        that.onChanged("price", calculateExtended);

        return that;
    };

    models.payableLine.list = list("PayableLine");

    // Add static post functions to models
    postMixin("Voucher", "Payables");
    postMixin("DebitMemo", "Payables");
    postMixin("PayablesJournal", "Payables");

}());
