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
/*jslint this*/
const catalog = f.catalog();
const store = catalog.store();
const models = store.models();
const datasource = f.datasource();
const postMixin = store.mixins().post;

// Create bill subledger model
function billSubledger(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("BillSubledger");
    let model = f.createModel(data, feather);
    let d = model.data;

    model.onChanged("terms", function (prop) {
        let dt;
        let terms = prop();

        if (terms) {
            dt = new Date(d.docDate());
            switch (terms.data.policy()) {
            case "N":
                dt.setDate(dt.getDate() + terms.data.net.toJSON());
                break;
            case "D":
                dt.setMonth(dt.getMonth() + 2);
                dt.setDate(terms.data.day.toJSON());
                dt = dt.toDate();
                break;
            }
            d.dueDate(dt);
        }
    });

    model.state().resolve("/Ready/Fetched/Clean").enter(function () {
        if (model.data.isPosted()) {
            this.goto("../ReadOnly");
        }
    });

    return model;
}

catalog.registerModel("BillSubledger", billSubledger);

models.fiscalPeriod.static().closeCheck = function (selections) {
    "use strict";

    return selections.every(function (model) {
        return (
            model.data.status() !== "C" && (
                !model.data.previous() ||
                model.data.previous().data.status() === "C"
            )
        );
    });
};

models.fiscalPeriod.static().openCheck = function (selections) {
    "use strict";

    return selections.every(function (model) {
        return (
            model.data.status() === "C" && (
                !model.data.next() ||
                model.data.next().data.status() !== "C"
            )
        );
    });
};

function changePeriodStatus(viewModel, action) {
    "use strict";

    let dialog = viewModel.confirmDialog();
    let selected = viewModel.selections()[0];
    let payload = {
        method: "POST",
        path: "/ledger/" + action,
        body: {
            id: selected.id()
        }
    };

    function callback() {
        viewModel.refresh();
    }

    function error(err) {
        dialog.message(err.message);
        dialog.title("Error");
        dialog.icon("exclamation-triangle");
        dialog.onOk(undefined);
        dialog.buttonCancel().hide();
        dialog.show();
    }

    datasource.request(payload).then(callback).catch(error);
}

models.fiscalPeriod.static().close = function (viewModel) {
    "use strict";

    changePeriodStatus(viewModel, "close-fiscal-period");
};

models.fiscalPeriod.static().open = function (viewModel) {
    "use strict";

    changePeriodStatus(viewModel, "open-fiscal-period");
};

// Create ledger transaction model
function ledgerTransaction(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("LedgerTransaction");
    let model;

    // Set default currency attribute
    feather.properties.currency.default = f.baseCurrency;

    model = f.createModel(data, feather);

    // Sync currency
    function update() {
        let value;
        let dist = model.data.distributions();
        let code = model.data.currency().data.code();
        let total = model.data.amount();

        // Update distributions
        code = model.data.currency().data.code();

        dist.forEach(function (item) {
            if (item.data.debit().currency !== code) {
                value = f.copy(item.data.debit());
                value.currency = code;
                item.data.debit(value);
            }
            if (item.data.credit().currency !== code) {
                value = f.copy(item.data.credit());
                value.currency = code;
                item.data.credit(value);
            }
        });

        // Update total
        if (total.currency !== code) {
            total.currency = code;
        }

        total.amount = 0;
        dist.forEach(function (item) {
            if (item.state().current()[0] !== "/Delete") {
                total.amount = total.amount.plus(item.data.debit().amount);
            }
        });

        model.data.amount(total);
    }

    model.onChanged("currency", update);
    model.onChanged("distributions", update);
    model.onChanged("distributions.debit", update);
    model.onChanged("distributions.credit", update);
    model.state().resolve("/Ready/Fetched/Clean").enter(function () {
        if (model.data.isPosted()) {
            model.isReadOnly(true);
            model.state().goto("/Ready/Fetched/ReadOnly");
        }
    });

    // Can't delete posted journals
    model.onCanDelete(function () {
        return !model.data.isPosted();
    });

    function sum(total, item) {
        if (item.debit.amount) {
            return total.minus(item.debit.amount);
        } else {
            return total.plus(item.credit.amount);
        }
    }

    model.onValidate(function () {
        let dist = model.data.distributions().toJSON();

        if (!dist.length) {
            throw "There are no distributions.";
        }

        if (dist.reduce(sum, 0) !== 0) {
            throw "Journal entries must sum to zero.";
        }

    });

    // Return instantiated model
    return model;
}

catalog.registerModel("LedgerTransaction", ledgerTransaction);

// Create ledger distribution model
function ledgerDistribution(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("LedgerDistribution");
    let model = f.createModel(data, feather);

    model.onChange("debit", function (prop) {
        let debit = prop.newValue.toJSON();
        let credit = model.data.credit.toJSON();

        if (debit.amount < 0) {
            debit.amount = 0;
            prop(f.copy(debit));
        } else if (debit.amount && credit.amount) {
            credit.amount = 0;
            model.data.credit(f.copy(credit));
        }
    });

    model.onChange("credit", function (prop) {
        let credit = prop.newValue.toJSON();
        let debit = model.data.debit.toJSON();

        if (credit.amount < 0) {
            credit.amount = 0;
            prop(f.copy(credit));
        } else if (credit.amount && debit.amount) {
            debit.amount = 0;
            model.data.debit(f.copy(debit));
        }
    });

    model.onValidate(function () {
        if (
            model.data.debit().amount - 0 === 0 &&
            model.data.credit().amount - 0 === 0
        ) {
            throw "Debit or credit must be positive on every distribution.";
        }
    });

    return model;
}

catalog.registerModel("LedgerDistribution", ledgerDistribution);

// Create ledger account model
function ledgerAccount(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("LedgerAccount");
    let model = f.createModel(data, feather);

    model.onCanDelete(function () {
        return !model.data.isUsed() && !model.data.isParent();
    });

    model.onValidate(function () {
        let parent = model.data.parent();

        if (parent && parent.data.isUsed()) {
            throw "Account used in transactions may not become a parent.";
        }
    });

    // Return instantiated model
    return model;
}

catalog.registerModel("LedgerAccount", ledgerAccount);

// Add static post functions to Journal
postMixin("GeneralJournal", "Ledger");