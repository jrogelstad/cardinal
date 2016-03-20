/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var express = require("express");

  // Register route to the public
  var doRequest,
    router = express.Router();

  doRequest = function (req, res) {
   var payload, callback,
      args = req.body;

    callback = function (err, resp) {
      if (err) {
        res.status(err.statusCode).json(err.message);
        return;
      }

      res.json(resp);
    };

    payload = {
      method: "POST",
      name: this,
      user: "postgres", //getCurrentUser(),
      callback: callback,
      data: args
    };

    console.log(JSON.stringify(payload, null, 2));
    datasource.request(payload);
  };

  router.route("/post-journal").post(doRequest.bind("postJournal"));
  router.route("/post-journals").post(doRequest.bind("postJournals"));
  router.route("/close-fiscal-period").post(doRequest.bind("closeFiscalPeriod"));

  app.use('/ledger', router);

}(app, datasource));
