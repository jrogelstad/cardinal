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
    models = catalog.register("models"),
    gjFeather = catalog.getFeather("GeneralJournal"),
    gjdFeather = catalog.getFeather("JournalDistribution"),
    math = require("mathjs"),
    ledgerSettings = models.ledgerSettings();

  ledgerSettings.fetch().then(function () {

    // Create general journal model
    models.generalJournal = function (data) {
      data = data || {};
      var that;

      // Set default currency on 'kind' (currency) attribute
      gjFeather.properties.kind.default = function () {
        return ledgerSettings.data.defaultCurrency.toJSON();
      };

      that = model(data, gjFeather);

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

    models.generalJournal.list = list("GeneralJournal");

    // Create general journal distribution model
    models.journalDistribution = function (data) {
      data = data || {};
      var that = model(data, gjdFeather);

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
  });
}());
