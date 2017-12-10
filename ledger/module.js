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
    feather = catalog.getFeather("GeneralJournal"),
    ledgerSettings = models.ledgerSettings();

  ledgerSettings.fetch().then(function () {

    // Create general journal model
    models.generalJournal = function (data) {
      data = data || {};
      var that;

      // Set default currency on 'kind' (currency) attribute
      feather.properties.kind.default = function () {
        return ledgerSettings.data.defaultCurrency.toJSON();
      };

      that = model(data, feather);

      // Can't delete posted general journals
      that.onCanDelete(function () {
        return !that.data.isPosted();
      });

      // Return instantiated model
    	return that;
  	};

    models.generalJournal.list = list("GeneralJournal");
  });
}());
