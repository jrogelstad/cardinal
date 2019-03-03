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
    Voucher model
*/
function voucher(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Voucher");
    let that = model(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(that, "vendor");

    return that;
}

catalog.registerModel("Voucher", voucher, true);

 /**
    Debit memo model
*/
function debitMemo(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("CreditMemo");
    let that = model(data, feather);
    let mixinOrderHeader = catalog.store().mixins().orderHeader;

    mixinOrderHeader(that, "vendor");

    return that;
}

catalog.registerModel("DebitMemo", debitMemo, true);

/**
    Payable model
*/
function payable(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Payable");
    let that = model(data, feather);
    let d = that.data;

    that.onChanged("vendor", function () {
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

    return that;
}

catalog.registerModel("Payable", payable, true);

 /**
    Payable line model
*/
function payableLine(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("PayableLine");
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

catalog.registerModel("PayableLine", payableLine);

// Add static post functions to models
postMixin("Voucher", "Payables");
postMixin("DebitMemo", "Payables");
postMixin("PayablesJournal", "Payables");

