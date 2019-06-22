/*
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
*/
const catalog = f.catalog();
const store = catalog.store();

 /**
    Sales order model
*/
function salesOrder(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("SalesOrder");
    let model = f.createModel(data, feather);
    let d = model.data;
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(model, "customer");

    model.onChanged("customer", function () {
        let customer = d.customer();

        if (customer) {
            d.shipTo(customer.data.shipTo());
        }
    });

    model.onChanged("lines", function () {
        let promiseDate = d.promiseDate();

        d.lines().some(function (line) {
            if (!line.data.promiseDate()) {
                return line.data.promiseDate(promiseDate);
            }
        });
    });

    return model;
}

catalog.registerModel("SalesOrder", salesOrder);

 /**
    Sales order line model
*/
function salesOrderLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("SalesOrderLine");
    let model = f.createModel(data, feather);
    let d = model.data;

    model.onChanged("ordered", function () {
        let currency = model.parent().data.currency().data.code();
        let amount = d.ordered.toJSON().times(d.price.toJSON().amount);

        d.extended(f.money(amount, currency));
    });

    return model;
}

catalog.registerModel("SalesOrderLine", salesOrderLine);