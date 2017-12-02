/*global datasource*/
(function (datasource) {
  "strict";

  var doCheckJournal, doPostJournal, doPostJournals,
    f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  math.config({ precision: 6});

  /**
    Check whether a passed journal is valid or not.
    Raises error if not.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.journal] Journal to check.
  */
  doCheckJournal = function (obj) {
    try {
      var sumcheck = math.bignumber(0),
        data = obj.data.journal;

      if (!Array.isArray(data.distributions)) {
        throw "Distributions must be a valid array.";
      }

      // Check distributions
      data.distributions.forEach(function (dist) {
        if (dist.debit) {
          if (dist.debit <= 0) {
            throw "Debit must be a positive number.";
          }
          sumcheck = math.subtract(
            sumcheck, 
            math.bignumber(dist.debit)
          );
        }

        if (dist.credit) {
          if (dist.credit <= 0) {
            throw "Credit must be a positive number.";
          }
          sumcheck = math.add(
            sumcheck,
            math.bignumber(dist.credit)
          );
        }
      });

      // Check balance
      if (math.number(sumcheck) !== 0) {
        throw "Distribution does not balance.";
      }

      // Everything passed
      obj.callback();
    } catch (e) {
      obj.callback(e);
    }
  };

  datasource.registerFunction("POST", "checkJournal", doCheckJournal);

  /**
    Post a journal and update trial balance.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Journal data
    @param {Object} [payload.data.id] Journal id to post. Required
    @param {Object} [payload.data.date] Post date. Default today.
  */
  doPostJournal = function (obj) {
    try {
      if (!obj.data || !obj.data.id) {
        throw "Id must be provided";
      }
      obj.data.ids = [obj.data.id];
      delete obj.data.id;
      doPostJournals(obj);
    } catch (e) {
      obj.callback(e);
    }
  };

  datasource.registerFunction("POST", "postJournal", doPostJournal);

  /**
    Post a series of journals and update trial balance.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Journal data
    @param {Array} [payload.data.ids] Journal ids to post. Required
    @param {Object} [payload.data.date] Post date. Default today.
  */
  doPostJournals = function (obj) {
    try {
      var afterCurrency, afterTrialBalance, afterJournals,
        afterPostBalance, afterPostTransaction, afterUpdate,
        getLedgerAccounts, afterLedgerAccounts, getParents,
        kind, currency, journals, count, transaction,
        raiseError, process, profitLossIds, balanceSheetIds,
        data = obj.data,
        client = obj.client,
        callback = obj.callback,
        date = data.date || f.today(),
        ledgerAccounts = {},
        ledgerAccountIds = [],
        distributions = [],
        trialBalances = [],
        profitLossDist = {},
        balanceSheetDist = {},
        n = 0;

      if (!Array.isArray(obj.data.ids)) {
        throw "Ids must be provided";
      }

      // Helper functions
      process = function (transDist, dist) {
        var amount = math.number(math
          .chain(math.bignumber(transDist.credit))
          .subtract(math.bignumber(transDist.debit))
          .add(math.bignumber(dist.credit))
          .subtract(math.bignumber(dist.debit))
          .done());
        if (amount > 0) {
          transDist.credit = amount;
          transDist.debit = 0;
        } else {
          transDist.credit = 0;
          transDist.debit = amount * -1;
        }
      };

      getParents = function (id, ary) {
        ary = ary || [];
        var ledgerAccount;

        ary.push(id);

        ledgerAccount = ledgerAccounts[id];

        if (ledgerAccount.parent) {
          getParents(ledgerAccount.parent.id, ary);
        }

        return ary;
      };

      afterJournals = function (err, resp) {
        try {
          if (err) { throw err; }

          if (resp.length !== data.ids.length) {
            throw "Journal(s) not found.";
          }

          journals = resp;
          count = 1;

          // Build list of accounts and distribution data
          journals.forEach(function (journal) {
            if (kind && kind.id !== journal.kind.id) {
              throw "Journals must all be in the same currency.";
            }
            kind = journal.kind;

            if (journal.isPosted) {
              throw "Journal " +  journal.number + " is already posted.";
            }

            journal.distributions.forEach(function (dist) {
              var transDist,
                accountId = dist.node.id;
              if (dist.node.kind.type === "Revenue" || dist.node.kind.type === "Expense") {
                transDist = profitLossDist[accountId];
                if (transDist) {
                  process(transDist, dist);
                } else {
                  profitLossDist[accountId] = {
                    id: f.createId(),
                    node: dist.node,
                    credit: dist.credit,
                    debit: dist.debits
                  };
                }
              } else {
                transDist = balanceSheetDist[accountId];
                if (transDist) {
                  process(transDist, dist);
                } else {
                  balanceSheetDist[accountId] = {
                    id: f.createId(),
                    node: dist.node,
                    credit: dist.credit,
                    debit: dist.debit
                  };
                }
              }
            });
          });

          // Build distributions and filter criteria
          balanceSheetIds = Object.keys(balanceSheetDist);
          balanceSheetIds.forEach(function (id) {
            distributions.push(balanceSheetDist[id]);
          });
          ledgerAccountIds = ledgerAccountIds.concat(balanceSheetIds);

          profitLossIds = Object.keys(profitLossDist);
          profitLossIds.forEach(function (id) {
            distributions.push(profitLossDist[id]);
          });
          ledgerAccountIds = ledgerAccountIds.concat(profitLossIds);

          getLedgerAccounts(ledgerAccountIds);
        } catch (e) {
          callback(e);
        }
      };

      getLedgerAccounts = function (ids) {
        if (ids.length) {
          datasource.request({
            method: "GET",
            name: "LedgerAccount",
            client: client,
            callback: afterLedgerAccounts,
            filter: {
              criteria: [{
                property: "id",
                operator: "IN",
                value: ids}]
            }
          }, true);
          return;
        }

        datasource.request({
          method: "GET",
          name: "Currency",
          client: client,
          callback: afterCurrency,
          id: kind.id
        }, true);
      };

      afterLedgerAccounts = function (err, resp) {
        try {
          if (err) { throw err; }

          ledgerAccountIds = [];

          // Add parents to array of trial balance to update
          resp.forEach(function (ledgerAccount) {
            var id = ledgerAccount.id,
              parentId = ledgerAccount.parent ? ledgerAccount.parent.id : false;
            ledgerAccounts[ledgerAccount.id] = ledgerAccount;
            if (parentId && ledgerAccountIds.indexOf(parentId) === -1) {
              ledgerAccountIds.push(parentId);
            }
            if (ledgerAccount.kind.type === "Revenue" ||
                ledgerAccount.kind.type === "Expense") {
              if (profitLossIds.indexOf(id) === -1) {
                profitLossIds.push(id);
              }
            } else {
              if (balanceSheetIds.indexOf(id) === -1) {
                balanceSheetIds.push(id);
              }
            }
          });

          getLedgerAccounts(ledgerAccountIds);
        } catch (e) {
          callback(e);
        }
      };

      afterCurrency = function (err, resp) {
        try {
          if (err) { throw err; }
          if (!resp) { throw "Invalid currency."; }

          currency = resp;

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
                  property: "kind",
                  value: currency},{
                  property: "parent.id",
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
                  property: "kind",
                  value: currency},{
                  property: "parent.id",
                  operator: "IN",
                  value: balanceSheetIds},{
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
        } catch (e) {
          callback(e);
        }
      };

      afterTrialBalance = function (err, resp) {
        var hasError = false;

        try {
          n += 1;

          // Only throw error once all requests return response
          if (err && !raiseError) {
            raiseError = err;
            return;
          }

          trialBalances = trialBalances.concat(resp);

          if (n < count) { return; }
          if (raiseError) { throw raiseError; }

          n = 0;
          count = trialBalances.length + 1;
          transaction = {
            kind: journals[0].kind,
            date: date,
            note: data.note,
            distributions: distributions
          };

          // Post journal
          datasource.request({
            method: "POST",
            name: "GeneralLedgerTransaction",
            client: client,
            callback: afterPostTransaction,
            data: transaction      
          }, true);

          // Post balance updates
          distributions.forEach(function (dist) {
            var ids = getParents(dist.node.id),
              debit = function (row) {
                row.balance = math.number(math.subtract(
                  math.bignumber(row.balance), 
                  math.bignumber(dist.debit)
                ));
              },
              credit = function (row) {
                row.balance = math.number(math.add(
                  math.bignumber(row.balance),
                  math.bignumber(dist.credit)
                ));
              };

            // Iterate through trial balances for account and parents
            ids.forEach(function (id) {
              if (hasError) { return; }

              var update,
                balances = trialBalances.filter(function (row) {
                  return row.parent.id === id;
                });

              if (!balances.length) {
                hasError = true;
                count = 2;
                afterPostBalance("No open trial balance for account " + dist.node.code + ".");
                return;
              }

              if (dist.debit) {
                balances[0].debits = math.number(math.add(
                  math.bignumber(balances[0].debits), 
                  math.bignumber(dist.debit)
                ));
                update = debit;
              } else {
                balances[0].credits = math.number(math.add(
                  math.bignumber(balances[0].credits),
                  math.bignumber(dist.credit)
                ));
                update = credit;
              }

              balances.forEach(update);
            });
          });

          // If error, forget about it
          if (hasError) { return; }

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
        } catch (e) {
          callback(e);
        }
      };

      afterPostBalance = function (err) {
        try {
          if (err && !raiseError) {
            raiseError = err;
          }

          n += 1;
          if (n < count) { return; }

          // Raise error only after to all requests
          // completed to ensure complete rollback
          if (raiseError) { throw raiseError; }

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
        } catch (e) {
          callback(e);
        }
      };

      afterUpdate = function (err) {
        n += 1;
        if (err && !raiseError) {
          raiseError = err;
          return;
        }

        if (n < count) { return; }
        callback(raiseError, true);
      };

      afterPostTransaction = function (err, resp) {
        try {
          if (err) { throw err; }
          jsonpatch.apply(transaction, resp);
          afterPostBalance();
        } catch (e) {
          afterPostBalance(e);
        }
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
    } catch (e) {
      obj.callback(e);
    }
  };

  datasource.registerFunction("POST", "postJournals", doPostJournals);

}(datasource));
