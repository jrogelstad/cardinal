/*global require */
/*jslint es6*/
(function () {
    "strict";

    const catalog = require("catalog");
    const model = require("model");
    const list = require("list");
    const models = catalog.register("models");

     /**
        Invoice model
    */
    models.invoice = function (data, feather) {
        feather = feather || catalog.getFeather("Invoice");
        var that = model(data, feather),
            mixinOrderHeader = catalog.store().mixins().orderHeader;

        mixinOrderHeader(that);

        return that;
    };

    models.invoice.list = list("Invoice");

}());
