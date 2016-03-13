/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var express = require("express");

  // Register route to the public
  var doPostJournal, doPostJournals,
    router = express.Router();
  
  doPostJournal = function (req, res) {
    req.name = "postJournal";
    doPostJournals(req, res);
  };

  doPostJournals = function (req, res) {
    var payload, callback,
      name = req.name || "postJournals",
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
      name: name,
      user: "postgres", //getCurrentUser(),
      callback: callback,
      data: {
        args: args
      }
    };

    console.log(JSON.stringify(payload, null, 2));
    datasource.request(payload);
  };

  router.route("/post-journal").post(doPostJournal);
  router.route("/post-journals").post(doPostJournals);

  app.use('/ledger', router);

}(app, datasource));
