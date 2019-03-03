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
const postMixin = store.mixins().post;

 /**
    Invoice model
*/
function invoice(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Invoice");
    let that = model(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(that, "customer");

    return that;
}

catalog.registerModel("Invoice", invoice, true);

 /**
    Credit memo model
*/
function creditMemo(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("CreditMemo");
    let that = model(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(that, "customer");

    return that;
}

catalog.registerModel("CreditMemo", creditMemo, true);

/**
    Receivable model
*/
function receivable(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Receivable");
    let that = model(data, feather);
    let d = that.data;

    that.onChanged("customer", function () {
        let billTo;
        let customer = d.customer();

        if (customer) {
            billTo = f.copy(customer.data.billTo.toJSON());
            billTo.id = f.createId();
            d.billTo(billTo);
            d.site(customer.data.site());
            d.contact(customer.data.contact());
            d.currency(customer.data.currency());
            d.terms(customer.data.terms());
            d.taxType(customer.data.taxType());
        }
    });

    return that;
}

catalog.registerModel("Receivable", receivable, true);

 /**
    Receivable line model
*/
function receivableLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("ReceivableLine");
    let that = model(data, feather);
    let d = that.data;

    function calculateExtended() {
        let currency = that.parent().data.currency().data.code();
        let amount = d.billed.toJSON().times(d.price.toJSON().amount);

        d.extended(f.money(amount, currency));
    }

    that.onChanged("ordered", function () {
        let ordered = d.ordered.toJSON();

        if (ordered > d.billed.toJSON()) {
            d.billed(ordered);
        }
    });

    that.onChanged("billed", calculateExtended);
    that.onChanged("price", calculateExtended);

    return that;
}

catalog.registerModel("ReceivableLine", receivableLine, true);

// Add static post functions to models
postMixin("Invoice", "Receivables");
postMixin("CreditMemo", "Receivables");
postMixin("ReceivablesJournal", "Receivables");

