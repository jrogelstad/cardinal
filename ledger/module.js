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

(function () {
  "use strict";

  var catalog = require("catalog"),
    model = require("model"),
    list = require("list"),
    dataSource = require("datasource"),
    models = catalog.register("models"),
    jFeather = catalog.getFeather("GeneralJournal"),
    jdFeather = catalog.getFeather("JournalDistribution"),
    math = require("mathjs"),
    ledgerSettings = models.ledgerSettings();

  // Create general journal model
  models.journal = function (data) {
    data = data || {};
    var that;

    // Set default currency on 'kind' (currency) attribute
    jFeather.properties.kind.default = ledgerSettings.data.defaultCurrency.toJSON;

    that = model(data, jFeather);

    // Can't delete posted general journals
    that.onCanDelete(function () {
      return !that.data.isPosted();
    });

    that.onValidate(function () {
      var dist = that.data.distributions().toJSON(),
        sumcheck = math.bignumber(0);

      if (!dist.length) {
        throw "There are no distributions.";
      }

      dist.forEach(function (item) {
        if (item.debit) {
          sumcheck = math.subtract(
            sumcheck, 
            math.bignumber(item.debit)
          );
        } else {
          sumcheck = math.add(
            sumcheck, 
            math.bignumber(item.credit)
          );
        }
      });

      if (math.number(sumcheck) !== 0) {
        throw "Journal entries must sum to zero.";
      }

    });

    // Return instantiated model
    return that;
  };

  // Private helper to consolidate logic
  function post (ids, viewModel, message, unposted) {
    var dialog = viewModel.confirmDialog(),
      payload = {
        method: "POST", 
        path: "/ledger/post-journals",
        data: {ids: ids}
      },
      callback = function () {
        unposted.forEach(function(model) {
          model.fetch();
        });
      },
      error = function (err) {
        dialog.message(err.message);
        dialog.title("Error");
        dialog.icon("exclamation-triangle");
        dialog.onOk(undefined);
        dialog.show();
      };

    dialog.message(message);
    dialog.icon("question-circle");
    dialog.onOk(function () {
      dataSource.request(payload)
                .then(callback)
                .catch(error);
    });
    dialog.show();
  }

  // Static functions
  models.journal.list = list("Journal");
  models.journal.post = function (viewModel) {
    var message = "Are you sure you want to post the selected journals?",
      unposted = viewModel.tableWidget().selections().filter(function(model) {
        return !model.data.isPosted();
      }),
      ids = unposted.map(function (model) {
        return model.id();
      });

    if (!ids.length) { return; }

    post(ids, viewModel, message, unposted);
  };
  models.generalJournal.postAll = function (viewModel) {
    var message = "Are you sure you want to post all unposted journals?",
      // Have to do this first because we made filter do something else on lists!
      ary = viewModel.tableWidget().models().map(function(model) {
        return model;
      }),
      unposted = ary.filter(function(model) {
        return !model.data.isPosted();
      });

    post(null, viewModel, message, unposted);
  };
  models.generalJournal.postCheck = function (selections) {
    return selections.some(function(model) {
      return !model.data.isPosted();
    });
  };

  // Create general journal distribution model
  models.journalDistribution = function (data) {
    data = data || {};
    var that = model(data, jdFeather);

    that.onChange("debit", function (prop) {
      var value = prop();

      if (value < 0) {
        prop.newValue(0);
      } else if (value) {
        that.data.credit(0);
      }
    });

    that.onChange("credit", function (prop) {
      var value = prop();

      if (value < 0) {
        prop.newValue(0);
      } else if (value) {
        that.data.debit(0);
      }
    });

    that.onValidate(function () {
      if (that.data.debit() - 0 === 0 &&
          that.data.credit() - 0 === 0) {
        throw "Debit or credit must be positive on every distribution.";
      }
    });

    return that;
  };
}());