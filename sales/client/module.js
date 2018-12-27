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
    const models = catalog.register("models");

     /**
        Sales order model
    */
    models.salesOrder = function (data, feather) {
        feather = feather || catalog.getFeather("SalesOrder");
        var that = model(data, feather),
            d = that.data,
            mixinOrderHeader = catalog.store().mixins().orderHeader;

        mixinOrderHeader(that, "customer");
        
        that.onChanged("customer", function () {
            var customer = d.customer();

            if (customer) {
                d.shipTo(customer.data.shipTo());
            }
        });

        that.onChanged("lines", function () {
            var count,
                promiseDate = d.promiseDate();

            d.lines().some(function (line) {
                if (!line.data.promiseDate()) {
                    return line.data.promiseDate(promiseDate);
                }
            });
        });

        return that;
    };

    models.salesOrder.list = list("SalesOrder");

     /**
        Sales order line model
    */
    models.salesOrderLine = function (data, feather) {
        feather = feather || catalog.getFeather("SalesOrderLine");
        var that = model(data, feather),
            d = that.data;

        that.onChanged("ordered", function () {
            var currency = that.parent().data.currency().data.code(),
                amount = d.ordered.toJSON().times(d.price.toJSON().amount);

            d.extended(f.money(amount, currency));
        });

        return that;
    };

    models.salesOrderLine.list = list("SalesOrderLine");

}());
