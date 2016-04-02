/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  // Register database procedure on datasource
  var doAdjust = function (obj) {
    try {
      var afterCreditLocationBalance, afterDebitLocationBalance,
        afterGet, creditLocationBalance, debitLocationBalance, transaction,
        postRequest, postTransaction, afterPostTransaction, afterPostBalance,
        requestId, raiseError,
        count = 5,
        POSTED = 3,
        data = obj.data.specs,
        args = {
          item: data.item,
          debitLocation: data.location,
          creditLocation: {id: "u69aj7cgtkmf"}
        },
        date = data.date || f.now(),
        note = data.note,
        quantity = data.quantity,
        n = 0;

      afterGet = function (err, resp) {
        n += 1;
        if (err && !raiseError) {
          raiseError = err;
          return;
        }
        args[this] = resp;
        if (n < count) { return; }
        postRequest();
      };

      afterCreditLocationBalance = function (err, resp) {
        n += 1;
        if (err && !raiseError) { 
          raiseError = err;
          return;
        }
        if (resp.length) {
          creditLocationBalance = resp[0];
          creditLocationBalance.balance = math.add(creditLocationBalance.balance, quantity);
        } else {
          creditLocationBalance = {
            id: f.createId(),
            kind: args.item,
            parent: args.creditLocation,
            balance: quantity
          };
        }
        if (n === count) { postRequest(); }
      };

      afterDebitLocationBalance = function (err, resp) {
        n += 1;
        if (err && !raiseError) { 
          raiseError = err;
          return;
        }
        if (resp.length) {
          debitLocationBalance = resp[0];
          debitLocationBalance.balance = math.subtract(debitLocationBalance.balance, quantity);
        } else {
          debitLocationBalance = {
            id: f.createId(),
            kind: args.sitem,
            node: args.debitLocation,
            balance: quantity * -1
          };
        }
        if (n === count) { postRequest(); }
      };

      postRequest = function () {
        if (raiseError) {
          obj.callback(raiseError);
          return;
        }

        requestId = f.createId();
        datasource.request({
          method: "POST",
          name: "Request",
          client: obj.client,
          callback: postTransaction,
          isPosted: true,
          data: {
            id: requestId,
            kind: args.item,
            date: date,
            note: note,
            distributions: [{
              node: args.debitLocation,
              credit: quantity
            }, {
              node: args.creditLocation,
              debit: quantity
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
          kind: args.item,
          parent: {id: requestId},
          date: date,
          note: note,
          distributions: [{
            node: args.debitLocation,
            credit: quantity
          }, {
            node: args.creditLocation,
            debit: quantity
          }]
        };

        datasource.request({
          method: "POST",
          name: "InventoryTransaction",
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
        n += 1;
        if (err && !raiseError) {
          raiseError = err;
          return;
        }
        if (n === POSTED) {
          obj.callback(raiseError, transaction);
        }
      };

      afterPostTransaction = function (err, resp) {
        try {
          if (err) { throw err; }
          jsonpatch.apply(resp, transaction);
          afterPostBalance();
        } catch (e) {
          afterPostBalance(e);
        }
      };

      // Real work starts here
      datasource.request({
        method: "GET",
        name: "Item",
        client: obj.client,
        callback: afterGet.bind("item"),
        id: args.item.id
      }, true);

      datasource.request({
        method: "GET",
        name: "Location",
        client: obj.client,
        callback: afterGet.bind("debitLocation"),
        id: args.debitLocation.id
      }, true);

      datasource.request({
        method: "GET",
        name: "Location",
        client: obj.client,
        callback: afterGet.bind("creditLocation"),
        id: args.creditLocation.id
      }, true);

      datasource.request({
        method: "GET",
        name: "LocationBalance",
        client: obj.client,
        callback: afterCreditLocationBalance,
        filter: {
          criteria: [{
            property: "kind",
            value: args.item},{
            property: "parent",
            value: args.creditLocation}]
        }
      }, true);

      datasource.request({
        method: "GET",
        name: "LocationBalance",
        client: obj.client,
        callback: afterDebitLocationBalance,
        filter: {
          criteria: [{
            property: "kind",
            value: args.item},{
            property: "parent",
            value: args.debitLocation}]
        }
      }, true);
    } catch (e) {
      obj.callback(e);
    }
  };

  datasource.registerFunction("POST", "adjust", doAdjust);

}(datasource));
