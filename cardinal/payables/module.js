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
    Voucher model
*/
function voucher(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Voucher");
    let model = f.createModel(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(model, "vendor");

    return model;
}

catalog.registerModel("Voucher", voucher, true);

 /**
    Debit memo model
*/
function debitMemo(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("CreditMemo");
    let model = f.createModel(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(model, "vendor");

    return model;
}

catalog.registerModel("DebitMemo", debitMemo, true);

/**
    Payable model
*/
function payable(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Payable");
    let model = f.createModel(data, feather);
    let d = model.data;

    model.onChanged("vendor", function () {
        let remitTo;
        let vendor = d.vendor();

        if (vendor) {
            remitTo = f.copy(vendor.data.remitTo.toJSON());
            remitTo.id = f.createId();
            d.remitTo(remitTo);
            d.site(vendor.data.site());
            d.contact(vendor.data.contact());
            d.currency(vendor.data.currency());
            d.terms(vendor.data.terms());
            d.taxType(vendor.data.taxType());
        }
    });

    return model;
}

catalog.registerModel("Payable", payable, true);

 /**
    Payable line model
*/
function payableLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("PayableLine");
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

catalog.registerModel("PayableLine", payableLine);

// Add static post functions to models
postMixin("Voucher", "Payables");
postMixin("DebitMemo", "Payables");
postMixin("PayablesJournal", "Payables");

