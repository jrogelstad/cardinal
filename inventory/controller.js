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
        afterParent, getParent, propagate, requestId, raiseError,
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
        parents = [],
        n = 0;

      afterGet = function (err, resp) {
        n += 1;
        if (err && !raiseError) {
          raiseError = err;
          return;
        }
        args[this] = resp;
        if (n < count) { return; }
        getParent(args.debitLocation);
      };

      afterParent = function (err, resp) {
        try {
          if (err) { throw err; }
          parents.push(resp);
          getParent(resp);
        } catch (e) {
          obj.callback(e);
        }
      };

      getParent = function (resp) {
        if (resp.parent) {
          datasource.request({
            method: "GET",
            name: "Location",
            client: obj.client,
            callback: afterParent,
            id: resp.parent.id
          }, true);
          return;
        }
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
        if (n === count) { getParent(args.debitLocation); }
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
            kind: args.item,
            node: args.debitLocation,
            balance: quantity * -1
          };
        }
        if (n === count) { getParent(args.debitLocation); }
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
          if (raiseError) {
            obj.callback(raiseError);
            return;
          }
          propagate();
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

      propagate = function () {
        try {
          var parent, after;
          if (!parents.length) {
            obj.callback(null, transaction);
            return;
          }
          parent = parents.pop();

          after = function (err, resp) {
            try {
              var parentBalance;
              if (err) { throw err; }
              if (resp.length) {
                parentBalance = resp[0];
                parentBalance.balance = math.subtract(parentBalance.balance, quantity);
              } else {
                parentBalance = {
                  id: f.createId(),
                  kind: args.item,
                  node: parent,
                  balance: quantity * -1
                };
              }

              datasource.request({
                method: "POST",
                name: "LocationBalance",
                id: parentBalance.id,
                client: obj.client,
                callback: propagate,
                data: parentBalance
              }, true);
            } catch (e) {
              obj.callback(e);
            }
          };

          datasource.request({
            method: "GET",
            name: "LocationBalance",
            client: obj.client,
            callback: after,
            filter: {
              criteria: [{
                property: "kind",
                value: args.item},{
                property: "parent",
                value: parent}]
            }
          }, true);

        } catch (e) {
          obj.callback(e);
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
