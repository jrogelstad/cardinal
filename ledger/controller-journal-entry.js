/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  var doJournalEntry = function (obj) {
    var afterAccount, afterCurrency, afterLedgerBalance,
      createJournal, postJournal,
      afterPostBalance, afterPostTransaction,
      count, request, transaction, raiseError,
      data = obj.specs,
      n = 0;

    if (!Array.isArray(data.distributions)) {
      obj.callback("Distributions must be a valid array.");
      return;
    }
    count = data.distributions.length * 2 + 1;

    afterCurrency = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      if (!resp) {
        obj.callback("Invalid currency \"" + data.currency.id + "\".");
        return;
      }
      n += 1;
      if (n === count) { createJournal(); }
    };

    afterAccount = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }
      if (!resp) {
        obj.callback("Invalid ledger account \"" + this.ledgerAccount.id + "\".");
        return;
      }
      n += 1;
      if (n === count) { createJournal(); }
    };

    afterLedgerBalance = function (err, resp) {
      if (err) {
        obj.callback(err);
        return;
      }

      n += 1;
      if (resp.length) {
        this.ledgerBalance = resp[0];
      } else {
        this.ledgerBalance = {
          id: f.createId(),
          node: data.currency,
          container: this.ledgerAccount,
          balance: 0
        };
      }
      if (n === count) { createJournal(); }
    };

    createJournal = function () {
      var sumcheck = 0,
        quantity = 0;

      // Create baseline request
      request = {
        id: f.createId(),
        node: data.currency,
        date: data.time || f.today(),
        note: data.note,
        reference: data.reference,
        isPosted: true,
        distributions: []
      };

      // Build request distributions
      data.distributions.forEach(function (dist) {
        if (dist.debit) {
          if (dist.debit <= 0) {
            obj.callback("Debit must be a positive number.");
            return;
          }
          sumcheck = math.subtract(sumcheck, dist.debit);
          quantity = dist.debit * -1;
        }

        if (dist.credit) {
          if (dist.credit <= 0) {
            obj.callback("Credit must be a positive number.");
            return;
          }
          sumcheck = math.add(sumcheck, dist.credit);
          quantity = dist.credit;
        }

        dist.ledgerBalance.balance = math.add(dist.ledgerBalance.balance, quantity);

        request.distributions.push({
          container: dist.LedgerAccount,
          quantity: quantity
        });
      });

      // Check balance
      if (sumcheck !== 0) {
        obj.callback("Distribution does not balance.");
        return;
      }

      // Create journal
      datasource.request({
        method: "POST",
        name: "GeneralJournal",
        client: obj.client,
        callback: postJournal,
        data: request     
      }, true);
    };

    postJournal = function (err) {
      if (err) {
        obj.callback(err);
        return;
      }

      n = 0;
      count = request.distributions.length + 1;
      transaction = {
        node: data.currency,
        parent: request,
        date: data.date || f.today(),
        note: data.note,
        distributions: request.distributions
      };

      // Post journal
      datasource.request({
        method: "POST",
        name: "GeneralLedger",
        client: obj.client,
        callback: afterPostTransaction,
        data: transaction      
      }, true);
  
      // Post balance updates
      data.distributions.forEach(function (dist) {
        datasource.request({
          method: "POST",
          name: "LedgerBalance",
          id: dist.ledgerBalance.id,
          client: obj.client,
          callback: afterPostBalance,
          data: dist.ledgerBalance
        }, true);
      });
    };

    afterPostBalance = function (err) {
      if (err && !raiseError) {
        raiseError = err;
      }
      n += 1;
      if (n === count) {
        // Raise error only after to all requests
        // completed to ensure complete rollback
        if (raiseError) {
          obj.callback(raiseError);
          return;
        }
        obj.callback(null, transaction);
      }
    };

    afterPostTransaction = function (err, resp) {
      if (err) {
        afterPostBalance(err);
        return;
      }
      jsonpatch.apply(resp, transaction);
      afterPostBalance();
    };

    // Real work starts here
    data.distributions.forEach(function (dist) {
      datasource.request({
        method: "GET",
        name: "LedgerAccount",
        client: obj.client,
        callback: afterAccount.bind(dist),
        id: dist.ledgerAccount.id
      }, true);

      datasource.request({
        method: "GET",
        name: "LedgerBalance",
        client: obj.client,
        callback: afterLedgerBalance.bind(dist),
        filter: {
          criteria: [{
            property: "node",
            value: data.currency},{
            property: "container",
            value: dist.ledgerAccount}]
        }
      }, true);
     });

    datasource.request({
      method: "GET",
      name: "Currency",
      client: obj.client,
      callback: afterCurrency,
      id: data.currency.id
    }, true);
  };

  datasource.registerFunction("POST", "journalEntry", doJournalEntry);

}(datasource));
