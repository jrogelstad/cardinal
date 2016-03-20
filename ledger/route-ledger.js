/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var express = require("express");

  // Register route to the public
    router = express.Router();

  router.route("/post-journal").post(doRequest.bind("postJournal"));
  router.route("/post-journals").post(doRequest.bind("postJournals"));
  router.route("/close-fiscal-period").post(doRequest.bind("closeFiscalPeriod"));

  app.use('/ledger', router);

}(app, datasource));
