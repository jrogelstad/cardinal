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
        Receivable model
    */
    models.receivable = function (data, feather) {
        feather = feather || catalog.getFeather("Receivable");
        var that = model(data, feather),
            d = that.data;

        that.onChanged("terms", function (prop) {
            var dt,
                terms = prop();

            if (terms) {
                dt = new Date(d.docDate());
                switch (terms.data.policy()) {
                case "N":
                    dt.setDate(dt.getDate() + terms.data.net.toJSON());
                    break;
                case "D":
                    dt.setMonth(dt.getMonth() + 2);
                    dt.setDate(terms.data.day.toJSON()).toDate();
                    break;
                }
                d.dueDate(dt);
            }
        });

        return that;
    };

    models.receivable.list = list("Invoice");

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
        Credit memo model
    */
    models.creditMemo = function (data, feather) {
        feather = feather || catalog.getFeather("CreditMemo");
        var that = model(data, feather),
            mixinOrderHeader = catalog.store().mixins().orderHeader;

        mixinOrderHeader(that);

        return that;
    };

    models.creditMemo.list = list("CreditMemo");

     /**
        Receivable line model
    */
    models.receivableLine = function (data, feather) {
        feather = feather || catalog.getFeather("ReceivableLine");
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

    models.receivableLine.list = list("ReceivableLine");

    // Add static post functions to Invoice
    postMixin("Invoice", "Receivables");
}());
