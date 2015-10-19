/**
    Framework for building object relational database apps

    Copyright (C) 2015  John Rogelstad
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

/*global m, f, window */

(function () {

  "strict";

  var relations = [
      {
        feather: "Role",
        valueProperty: "name",
        labelProperty: "description"
      }, {
        feather: "Opportunity",
        valueProperty: "number",
        labelProperty: "name"
      }
    ];

  relations.forEach(function (relopts) {
    var name = relopts.feather.toCamelCase();
    f.components[name + "Relation"] = function (options) {
      options = options || {};
      var w = f.components.relationWidget({
        parentProperty: options.parentProperty || relopts.parentProperty,
        valueProperty: options.valueProperty || relopts.valueProperty,
        labelProperty: options.labelProperty || relopts.labelProperty
      });

      return w;
    };
  });

}());
