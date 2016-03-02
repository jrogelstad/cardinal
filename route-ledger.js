/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var express = require("express");

  // Register route to the public
  var router = express.Router();
  var doJournalEntry = function (req, res) {
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
      name: "journalEntry",
      user: "postgres", //getCurrentUser(),
      callback: callback,
      data: {
        specs: data
      }
    };

    console.log(JSON.stringify(payload, null, 2));
    datasource.request(payload);
  };

  router.route("/journal-entry").post(doJournalEntry);

  app.use('/ledger', router);

}(app, datasource));
