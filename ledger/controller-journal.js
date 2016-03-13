/*global datasource*/
(function (datasource) {
  "strict";

  var doCheckJournal, doPostJournal, doPostJournals,
    f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  /**
    Check whether a passed journal is valid or not.
    Raises error if not.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.journal] Journal to check.
  */
  doCheckJournal = function (obj) {
    var sumcheck = 0,
      data = obj.journal,
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

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.id] Journal id to post. Required
    @param {Object} [payload.date] Post date. Default today.
  */
  doPostJournal = function (obj) {
    obj.args.ids = [obj.args.id];
    delete obj.args.id;
    doPostJournals(obj);
  };

  datasource.registerFunction("POST", "postJournal", doPostJournal);

  /**
    Post a series of journals and update trial balance.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.ids] Journal ids to post. Required
    @param {Object} [payload.date] Post date. Default today.
  */
  doPostJournals = function (obj) {
    var afterCurrency, afterJournals, currency,
      afterPostBalance, afterPostTransaction,
      journals, count, transaction, raiseError,
      profitLossIds, balanceSheetIds,
      data = obj.args,
      client = obj.client,
      callback = obj.callback,
      date = data.date || f.today(),
      distributions = [],
      trialBalances = [],
      profitLossDist = {},
      balanceSheetDist = {},
      n = 0;

    afterJournals = function (err, resp) {
      var node, process;

      if (err) {
        callback(err);
        return;
      }
      if (resp.length !== data.ids.length) {
        callback("Journal(s) not found.");
        return;
      }

      // Helper function
      process = function (transDist, dist) {
        var amount = math.chain(transDist.credit)
          .subtract(transDist.debit)
          .add(dist.credit)
          .subtract(dist.debit)
          .done();
        if (amount > 0) {
          transDist.credit = amount;
          transDist.debit = 0;
        } else {
          transDist.credit = 0;
          transDist.debit = amount * -1;
        }
      };

      journals = resp;
      count = 1;

      // Build list of accounts and distribution data
      journals.forEach(function (journal) {
        if (raiseError) { return; }

        if (node && node.id !== journal.node.id) {
          raiseError = "Journals must all be in the same currency.";
          return;
        }
        node = journal.node;

        if (journal.isPosted) {
          raiseError = "Journal " +  journal.number + " is already posted.";
          return;
        }

        journal.distributions.forEach(function (dist) {
          var transDist,
            accountId = dist.container.id;
          if (dist.container.type === "Revenue" || dist.container.type === "Expense") {
            transDist = profitLossDist[accountId];
            if (transDist) {
              process(transDist, dist);
            } else {
              profitLossDist[accountId] = {
                id: f.createId(),
                container: dist.container,
                credit: dist.credit,
                debit: dist.debit
              };
            }
          } else {
            transDist = balanceSheetDist[accountId];
            if (transDist) {
              process(transDist, dist);
            } else {
              balanceSheetDist[accountId] = {
                id: f.createId(),
                container: dist.container,
                credit: dist.credit,
                debit: dist.debit
              };
            }
          }
        });
      });

      if (raiseError) {
        callback(raiseError);
        return;
      }

      datasource.request({
        method: "GET",
        name: "Currency",
        client: client,
        callback: afterCurrency,
        id: node.id
      }, true);
    };

    afterCurrency = function (err, resp) {
      if (err) {
        callback(err);
        return;
      }
      if (!resp) {
        callback("Invalid currency.");
        return;
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
          node: journals[0].node,
          date: date,
          note: data.note,
          distributions: distributions
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
        distributions.forEach(function (dist) {
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

      currency = resp;

      // Build distributions and filter criteria
      balanceSheetIds = Object.keys(balanceSheetDist);
      balanceSheetIds.forEach(function (id) {
        distributions.push(balanceSheetDist[id]);
      });

      profitLossIds = Object.keys(profitLossDist);
      profitLossIds.forEach(function (id) {
        distributions.push(profitLossDist[id]);
      });

      n = 0;
      if (profitLossIds.length && balanceSheetIds.length) {
        count = 2;
      } else {
        count = 1;
      }

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
              value: currency},{
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
              value: currency},{
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
      var afterUpdate;

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

      afterUpdate = function (err) {
        n += 1;
        if (err && !raiseError) {
          raiseError = err;
          return;
        }

        if (n < count) { return; }

        if (raiseError) {
          callback(raiseError);
          return;
        }

        callback(null, true);
      };

      n = 0;
      count = journals.length;

      journals.forEach(function (journal) {
        journal.isPosted = true;
        journal.folio = transaction.number;
        datasource.request({
          method: "POST",
          name: "Journal",
          client: client,
          callback: afterUpdate,
          id: journal.id,
          data: journal
        }, true);
      });
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
      callback: afterJournals,
      filter: {
        criteria: [{
          property: "id",
          operator: "IN",
          value: data.ids
        }]
      }
    }, true);
  };

  datasource.registerFunction("POST", "postJournals", doPostJournals);

}(datasource));
