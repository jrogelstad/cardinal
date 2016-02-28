/*global app, datasource*/
(function (app, datasource) {
  "strict";

  var f = require("./common/core"),
    express = require("express"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  // Register database procedure on datasource
  var adjust = function (obj) {
    var afterCreditLocationBalance, afterDebitLocationBalance,
      afterItem, afterDebitLocation, afterCreditLocation, 
      creditLocationBalance, debitLocationBalance, transaction,
      postRequest, postTransaction, afterPostTransaction, afterPostBalance,
      requestId,
      COMPLETE = 5,
      POSTED = 3,
      data = obj.specs,
      item = data.item,
      debitLocation = data.location,
      creditLocation = {id: "u69aj7cgtkmf"},
      time = data.time || f.now(),
      note = data.note,
      quantity = data.quantity,
      n = 0;

    afterItem = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      item = resp;
      if (n === COMPLETE) { postRequest(); }
    };

    afterCreditLocation = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      creditLocation = resp;
      if (n === COMPLETE) { postRequest(); }
    };

    afterDebitLocation = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      debitLocation = resp;
      if (n === COMPLETE) { postRequest(); }
    };

    afterCreditLocationBalance = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      if (resp.length) {
        creditLocationBalance = resp[0];
        creditLocationBalance.balance = math.add(creditLocationBalance.balance, quantity);
      } else {
        creditLocationBalance = {
          id: f.createId(),
          node: item,
          container: creditLocation,
          balance: quantity
        };
      }
      if (n === COMPLETE) { postRequest(); }
    };

    afterDebitLocationBalance = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      if (resp.length) {
        debitLocationBalance = resp[0];
        debitLocationBalance.balance = math.subtract(debitLocationBalance.balance, quantity);
      } else {
        debitLocationBalance = {
          id: f.createId(),
          node: item,
          container: debitLocation,
          balance: quantity * -1
        };
      }
      if (n === COMPLETE) { postRequest(); }
    };

    postRequest = function () {
      requestId = f.createId();
      datasource.request({
        method: "POST",
        name: "Request",
        client: obj.client,
        callback: postTransaction,
        isPosted: true,
        data: {
          id: requestId,
          node: item,
          time: time,
          note: note,
          distributions: [{
            container: debitLocation,
            quantity: quantity
          }, {
            container: creditLocation,
            quantity: quantity * -1
          }]
        }       
      }, true);
    };

    postTransaction = function (err) {
      if (err) {
        obj.callback(err);
        return;
      }

      n = 0;
      transaction = {
        node: item,
        parent: {id: requestId},
        time: time,
        note: note,
        distributions: [{
          container: debitLocation,
          quantity: quantity
        }, {
          container: creditLocation,
          quantity: quantity * -1
        }]
      };

      datasource.request({
        method: "POST",
        name: "Transaction",
        client: obj.client,
        callback: afterPostTransaction,
        data: transaction      
      }, true);

      datasource.request({
        method: "POST",
        name: "LocationBalance",
        id: debitLocationBalance.id,
        client: obj.client,
        callback: afterPostBalance,
        data: debitLocationBalance
      }, true);
      
      datasource.request({
        method: "POST",
        name: "LocationBalance",
        id: creditLocationBalance.id,
        client: obj.client,
        callback: afterPostBalance,
        data: creditLocationBalance
      }, true);
    };

    afterPostBalance = function (err) {
      if (err) {
        obj.callback(err);
        return;
      }
      n += 1;
      if (n === POSTED) {
        obj.callback(null, transaction);
      }
    };

    afterPostTransaction = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      jsonpatch.apply(resp, transaction);
      afterPostBalance();
    };

    // Real work starts here
    datasource.request({
      method: "GET",
      name: "Item",
      client: obj.client,
      callback: afterItem,
      id: item.id
    }, true);

    datasource.request({
      method: "GET",
      name: "Location",
      client: obj.client,
      callback: afterDebitLocation,
      id: debitLocation.id
    }, true);

    datasource.request({
      method: "GET",
      name: "Location",
      client: obj.client,
      callback: afterCreditLocation,
      id: creditLocation.id
    }, true);

    datasource.request({
      method: "GET",
      name: "LocationBalance",
      client: obj.client,
      callback: afterCreditLocationBalance,
      filter: {
        criteria: [{
          property: "node",
          value: item},{
          property: "container",
          value: creditLocation}]
      }
    }, true);

    datasource.request({
      method: "GET",
      name: "LocationBalance",
      client: obj.client,
      callback: afterDebitLocationBalance,
      filter: {
        criteria: [{
          property: "node",
          value: item},{
          property: "container",
          value: debitLocation}]
      }
    }, true);
  };

  datasource.registerFunction("POST", "adjust", adjust);

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
