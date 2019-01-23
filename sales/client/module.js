/**
    Framework for building object relational database apps
    Copyright (C) 2019  John Rogelstad

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
const catalog = f.catalog();
const store = catalog.store();
const model = store.factories().model;
const list = store.factories().list;

 /**
    Sales order model
*/
function salesOrder(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("SalesOrder");
    let that = model(data, feather);
    let d = that.data;
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(that, "customer");

    that.onChanged("customer", function () {
        let customer = d.customer();

        if (customer) {
            d.shipTo(customer.data.shipTo());
        }
    });

    that.onChanged("lines", function () {
        let promiseDate = d.promiseDate();

        d.lines().some(function (line) {
            if (!line.data.promiseDate()) {
                return line.data.promiseDate(promiseDate);
            }
        });
    });

    return that;
}

catalog.registerModel("SalesOrder", salesOrder, true);

 /**
    Sales order line model
*/
function salesOrderLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("SalesOrderLine");
    let that = model(data, feather);
    let d = that.data;

    that.onChanged("ordered", function () {
        let currency = that.parent().data.currency().data.code();
        let amount = d.ordered.toJSON().times(d.price.toJSON().amount);

        d.extended(f.money(amount, currency));
    });

    return that;
}

catalog.registerModel("SalesOrderLine", salesOrderLine);