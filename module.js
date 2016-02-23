/*global f */
(function () {
  "strict";

  var catalog = require("catalog"),
    item = catalog.store().models().item;

  // Adjustment transaction
  item.adjust = function (item, location, quantity) {
  	
  };

}());
