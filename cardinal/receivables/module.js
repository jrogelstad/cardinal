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
const postMixin = store.mixins().post;

 /**
    Invoice model
*/
function invoice(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Invoice");
    let model = f.createModel(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(model, "customer");

    return model;
}

catalog.registerModel("Invoice", invoice, true);

 /**
    Credit memo model
*/
function creditMemo(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("CreditMemo");
    let model = f.createModel(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(model, "customer");

    return model;
}

catalog.registerModel("CreditMemo", creditMemo, true);

/**
    Receivable model
*/
function receivable(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Receivable");
    let model = f.createModel(data, feather);
    let d = model.data;

    model.onChanged("customer", function () {
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

    return model;
}

catalog.registerModel("Receivable", receivable, true);

 /**
    Receivable line model
*/
function receivableLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("ReceivableLine");
    let model = f.createModel(data, feather);
    let d = model.data;

    function calculateExtended() {
        let currency = model.parent().data.currency().data.code();
        let amount = d.billed.toJSON().times(d.price.toJSON().amount);

        d.extended(f.money(amount, currency));
    }

    model.onChanged("ordered", function () {
        let ordered = d.ordered.toJSON();

        if (ordered > d.billed.toJSON()) {
            d.billed(ordered);
        }
    });

    model.onChanged("billed", calculateExtended);
    model.onChanged("price", calculateExtended);

    return model;
}

catalog.registerModel("ReceivableLine", receivableLine, true);

// Add static post functions to models
postMixin("Invoice", "Receivables");
postMixin("CreditMemo", "Receivables");
postMixin("ReceivablesJournal", "Receivables");

