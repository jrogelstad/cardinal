/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  var doJournalEntry = function (obj) {
    var afterAccount, afterCurrency, createJournal, postJournal,
      afterPostBalance, afterPostTransaction,
      count, request, transaction, raiseError,
      data = obj.specs,
      trialBalances = [],
      profitLossIds = {},
      balanceSheetIds = {},
      date = data.date || f.today(),
      n = 0;

    if (!Array.isArray(data.distributions)) {
      obj.callback("Distributions must be a valid array.");
      return;
    }
    count = data.distributions.length + 1;

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

      if (resp.type === "Revenue" || resp.type === "Liability") {
        profitLossIds[resp.id] = null;
      } else {
        balanceSheetIds[resp.id] = null;
      }

      n += 1;
      if (n === count) { createJournal(); }
    };

    createJournal = function () {
      var sumcheck = 0,
        quantity = 0;

      // Create baseline request
      request = {
        id: f.createId(),
        node: data.currency,
        date: date,
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

      balanceSheetIds = Object.keys(balanceSheetIds);
      profitLossIds = Object.keys(profitLossIds);
      n = 0;
      if (profitLossIds.length && balanceSheetIds.length) {
        count = 2;
      } else {
        count = 1;
      }

      var afterTrialBalance = function (err, resp) {
        n += 1;

        if (err && !raiseError) {
          raiseError = err;
          return;
        }

        trialBalances = trialBalances.concat(resp);
        if (n < count) {
          return;
        }

        if (raiseError) {
          obj.callback(raiseError);
          return;
        }

        n = 0;
        count = trialBalances.length + 1;
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
          var update,
            balances = trialBalances.filter(function (row) {
              return row.container.id === dist.ledgerAccount.id;
            }),
            debit = function (row) {
              row.balance = math.subtract(row.balance, dist.debit);
            },
            credit = function (row) {
              row.balance = math.add(row.balance, dist.credit);
            };

          if (!balances.length) {
            count = 2;
            afterPostBalance("No open trial balance for account " + dist.ledgerAccount.name + ".");
            return;
          }

          if (dist.debit) {
            balances[0].debits = math.add(balances[0].debits, dist.debit);
            update = debit;
          } else {
            balances[0].credits = math.add(balances[0].credits, dist.credit);
            update = credit;
          }
          update = dist.debit ? debit : credit;
          balances.forEach(update);
        });

        trialBalances.forEach(function (balance) {
          datasource.request({
            method: "POST",
            id: balance.id,
            name: "TrialBalance",
            client: obj.client,
            callback: afterPostBalance,
            data: balance
          }, true);
        });
      };

      // Retrieve profit/loss trial balances
      if (profitLossIds.length) {
        datasource.request({
          method: "GET",
          name: "TrialBalance",
          client: obj.client,
          callback: afterTrialBalance,
          filter: {
            criteria: [{
              property: "node",
              value: data.currency},{
              property: "container.id",
              operator: "IN",
              value: profitLossIds},{
              property: "period.start",
              operator: "<=",
              value: date},{
              property: "period.end",
              operator: ">=",
              value: date},{
              property: "period.isClosed",
              value: false}],
            sort: [{
              property: "period.start",
              value: "start"
            }]
          }
        }, true);
      }

      // Retrieve balance sheet trial balances
      if (balanceSheetIds.length) {
        datasource.request({
          method: "GET",
          name: "TrialBalance",
          client: obj.client,
          callback: afterTrialBalance,
          filter: {
            criteria: [{
              property: "node",
              value: data.currency},{
              property: "container.id",
              operator: "IN",
              value: balanceSheetIds},{
              property: "period.start",
              operator: ">=",
              value: date},{
              property: "period.isClosed",
              value: false}],
            sort: [{
              property: "period.start",
              value: "start"
            }]
          }
        }, true);
      }
    };

    afterPostBalance = function (err) {
      if (err && !raiseError) {
        raiseError = err;
      }
      n += 1;
      if (n < count) {
        return;
      }

      // Raise error only after to all requests
      // completed to ensure complete rollback
      if (raiseError) {
        obj.callback(raiseError);
        return;
      }
      obj.callback(null, transaction);
    };

    afterPostTransaction = function (err, resp) {
      if (err) {
        afterPostBalance(err);
        return;
      }
      jsonpatch.apply(transaction, resp);
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
