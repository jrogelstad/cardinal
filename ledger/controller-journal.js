/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  /**
    Check whether a passed journal is valid or not.
    Raises error if not.
  */
  var doCheckJournal = function (obj) {
    var sumcheck = 0,
      data = obj.data,
      callback = obj.callback;

    if (!Array.isArray(data.distributions)) {
      callback("Distributions must be a valid array.");
      return;
    }

    // Check distributions
    data.distributions.forEach(function (dist) {
      if (dist.debit) {
        if (dist.debit <= 0) {
          callback("Debit must be a positive number.");
          return;
        }
        sumcheck = math.subtract(sumcheck, dist.debit);
      }

      if (dist.credit) {
        if (dist.credit <= 0) {
          callback("Credit must be a positive number.");
          return;
        }
        sumcheck = math.add(sumcheck, dist.credit);
      }
    });

    // Check balance
    if (sumcheck !== 0) {
      callback("Distribution does not balance.");
      return;
    }

    // Everything passed
    callback();
  };

  datasource.registerFunction("POST", "checkJournal", doCheckJournal);

  /**
    Post a journal and update trial balance.
  */
  var doPostJournals = function (obj) {
    var afterAccount, afterCurrency, afterJournal, updateTrialBalance,
      afterPostBalance, afterPostTransaction, date,
      journal, count, transaction, raiseError,
      data = obj.specs,
      client = obj.client,
      callback = obj.callback,
      trialBalances = [],
      profitLossIds = {},
      balanceSheetIds = {},
      n = 0;

    afterJournal = function (err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (!resp) {
        callback("Invalid journal \"" + data.journal.id + "\".");
        return;
      }

      journal = resp;
      date = data.date || journal.date;
      count = journal.distributions.length + 1;

      // Real work starts here
      journal.distributions.forEach(function (dist) {
        datasource.request({
          method: "GET",
          name: "LedgerAccount",
          client: client,
          callback: afterAccount.bind(dist),
          id: dist.container.id
        }, true);
      });

      datasource.request({
        method: "GET",
        name: "Currency",
        client: client,
        callback: afterCurrency,
        id: journal.node.id
      }, true);
    };

    afterCurrency = function (err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (!resp) {
        callback("Invalid currency \"" + journal.node.id + "\".");
        return;
      }

      n += 1;
      if (n === count) { updateTrialBalance(); }
    };

    afterAccount = function (err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (!resp) {
        callback("Invalid ledger account \"" + this.ledgerAccount.id + "\".");
        return;
      }

      if (resp.type === "Revenue" || resp.type === "Liability") {
        profitLossIds[resp.id] = null;
      } else {
        balanceSheetIds[resp.id] = null;
      }

      n += 1;
      if (n === count) { updateTrialBalance(); }
    };

    updateTrialBalance = function (err) {
      if (err) {
        callback(err);
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
          callback(raiseError);
          return;
        }

        n = 0;
        count = trialBalances.length + 1;
        transaction = {
          node: journal.node,
          parent: journal,
          date: data.date || f.today(),
          note: journal.note,
          distributions: journal.distributions
        };

        // Post journal
        datasource.request({
          method: "POST",
          name: "GeneralLedger",
          client: client,
          callback: afterPostTransaction,
          data: transaction      
        }, true);
    
        // Post balance updates
        journal.distributions.forEach(function (dist) {
          var update,
            balances = trialBalances.filter(function (row) {
              return row.container.id === dist.container.id;
            }),
            debit = function (row) {
              row.balance = math.subtract(row.balance, dist.debit);
            },
            credit = function (row) {
              row.balance = math.add(row.balance, dist.credit);
            };

          if (!balances.length) {
            count = 2;
            afterPostBalance("No open trial balance for account " + dist.container.code + ".");
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
            client: client,
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
          client: client,
          callback: afterTrialBalance,
          filter: {
            criteria: [{
              property: "node",
              value: journal.node},{
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
          client: client,
          callback: afterTrialBalance,
          filter: {
            criteria: [{
              property: "node",
              value: journal.node},{
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
      var afterPatch;

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
        callback(raiseError);
        return;
      }

      afterPatch = function (err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null, true);
      };

      journal.isPosted = true;
      journal.folio = transaction.number;
      datasource.request({
        method: "POST",
        name: "Journal",
        client: client,
        callback: afterPatch,
        id: journal.id,
        data: journal
      }, true);
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
    datasource.request({
      method: "GET",
      name: "Journal",
      client: client,
      callback: afterJournal,
      id: data.id
    }, true);
  };

  datasource.registerFunction("POST", "postJournals", doPostJournals);

}(datasource));
