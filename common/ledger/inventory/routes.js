/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var express = require("express");

  // Register route to the public
  var router = express.Router();
  var doAdjust = function (req, res) {
    var payload, callback,
      data = req.body;

    callback = function (err, resp) {
      if (err) {
        res.status(err.statusCode).json(err.message);
        return;
      }

      res.json(resp);
    };

    payload = {
      method: "POST",
      name: "adjust",
      user: "postgres", //getCurrentUser(),
      callback: callback,
      data: {
        specs: data
      }
    };

    console.log(JSON.stringify(payload, null, 2));
    datasource.request(payload);
  };

  router.route("/adjust").post(doAdjust);

  app.use('/inventory', router);

}(app, datasource));
