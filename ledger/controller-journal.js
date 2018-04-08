/*global datasource*/
(function (datasource) {
  "strict";

  var doCheckJournal, doPostJournal, doPostJournals,
    f = require("./common/core"),
    math = require("mathjs"),
    jsonpatch = require("fast-json-patch");

  math.config({ precision: 6});

  /** 
    Journal insert handler
  */
  var doInsertJournal = function (obj) {
    return new Promise (function (resolve, reject) {
      var payload = {
          method: "POST",
          name: "checkJournal",
          client: obj.client,
          data: {
            journal: obj.data
          }
        };

      // Validate
      datasource.request(payload, true)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "Journal", doInsertJournal,
    datasource.TRIGGER_BEFORE);

  /** 
    Journal delete handler
  */
  var doDeleteJournal = function (obj) {
    return new Promise (function (resolve, reject) {
      var payload = {
          method: "GET",
          name: "Journal",
          id: obj.id,
          client: obj.client
        };

      // Validate
      function callback (resp) {
        if (resp.isPosted) {
          reject("Can not delete a posted journal.");
          return;
        }

        resolve();
      }

      datasource.request(payload, true)
        .then(callback)
        .catch(reject);
    });
  };

  datasource.registerFunction("DELETE", "Journal", doDeleteJournal,
    datasource.TRIGGER_BEFORE);

  /**
    Check whether a passed journal is valid or not.
    Raises error if not.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Object} [payload.journal] Journal to check.
  */
  doCheckJournal = function (obj) {
    return new Promise (function (resolve, reject) {
      var sumcheck = math.bignumber(0),
        data = obj.data.journal;

      if (!Array.isArray(data.distributions)) {
        reject("Distributions must be a valid array.");
        return;
      }

      if (!data.distributions.length) {
        reject("Distributions must not be empty.");
        return;
      }

      // Check distributions
      data.distributions.forEach(function (dist) {
        if (dist.debit) {
          if (dist.debit <= 0) {
            reject("Debit must be a positive number.");
            return;
          }

          sumcheck = math.subtract(
            sumcheck, 
            math.bignumber(dist.debit)
          );
        }

        if (dist.credit) {
          if (dist.credit <= 0) {
            reject("Credit must be a positive number.");
            return;
          }

          sumcheck = math.add(
            sumcheck,
            math.bignumber(dist.credit)
          );
        }
      });

      // Check balance
      if (math.number(sumcheck) !== 0) {
        reject("Distribution does not balance.");
        return;
      }

      // Everything passed
      resolve(true);
    });
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
    return new Promise (function (resolve, reject) {
      if (!obj.data || !obj.data.id) {
        reject("Id must be provided");
        return;
      }

      obj.data.ids = [obj.data.id];
      delete obj.data.id;

      doPostJournals(obj)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "postJournal", doPostJournal);

  /**
    Post a series of journals and update trial balance.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Object} [payload.data] Journal data
    @param {Array} [payload.data.ids] Journal ids to post. Default = all.
    @param {String} [payload.data.feather] Type of journal. Default = "Journal".
    @param {Object} [payload.data.date] Post date. Default today.
  */
  doPostJournals = function (obj) {
    return new Promise (function (resolve, reject) {
      var afterLedgerAccounts,
        kind, currency, journals, transaction,
        profitLossIds, balanceSheetIds,
        data = obj.data,
        date = data.date || f.today(),
        ledgerAccounts = {},
        ledgerAccountIds = [],
        distributions = [],
        trialBalances = [],
        profitLossDist = {},
        balanceSheetDist = {};

      // Helper functions
      function compute (transDist, dist) {
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
      }

      function getIds () {
        return new Promise (function (resolve, reject) {
          if (Array.isArray(obj.data.ids)) {
            resolve(obj.data.ids);
            return;
          }

          var payload = {
              method: "GET",
              name: obj.data.feather || "Journal",
              client: obj.client,
              filter: {
                criteria: [{
                  property: "isPosted",
                  operator: "=",
                  value: false
                }]
              }
            };

          function callback (resp) {
            data.ids = resp.map(function (row) { 
              return row.id;
            });

            resolve(data.ids);
          }

          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });
      }

      function getParents (id, ary) {
        ary = ary || [];
        var ledgerAccount;

        ary.push(id);

        ledgerAccount = ledgerAccounts[id];

        if (ledgerAccount.parent) {
          getParents(ledgerAccount.parent.id, ary);
        }

        return ary;
      }

      // Promise functions
      function getJournals (ids) {
        return new Promise (function (resolve, reject) {
          var payload = {
              method: "GET",
              name: "Journal",
              client: obj.client,
              filter: {
                criteria: [{
                  property: "id",
                  operator: "IN",
                  value: ids
                }]
              }
            };

          datasource.request(payload, true)
            .then(resolve)
            .catch(reject);
        });
      }

      function afterJournals (resp) {
        return new Promise (function (resolve, reject) {
          if (resp.length !== data.ids.length) {
            reject("Journal(s) not found.");
            return;
          }

          journals = resp;

          // Build list of accounts and distribution data
          journals.forEach(function (journal) {
            if (kind && kind.id !== journal.kind.id) {
              throw new Error("Journals must all be in the same currency.");
            }
            kind = journal.kind;

            if (journal.isPosted) {
              throw new Error("Journal " +  journal.number + " is already posted.");
            }

            journal.distributions.forEach(function (dist) {
              var transDist,
                accountId = dist.node.id;
              if (dist.node.kind.type === "Revenue" ||
                  dist.node.kind.type === "Expense") {
                transDist = profitLossDist[accountId];
                if (transDist) {
                  compute(transDist, dist);
                } else {
                  profitLossDist[accountId] = {
                    id: f.createId(),
                    node: dist.node,
                    credit: dist.credit,
                    debit: dist.debit
                  };
                }
              } else {
                transDist = balanceSheetDist[accountId];
                if (transDist) {
                  compute(transDist, dist);
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

          resolve(ledgerAccountIds);
        });
      }

      function getLedgerAccounts (ids) {
        return new Promise (function (resolve, reject) {
          var payload;

          if (ids.length) {
            payload = {
              method: "GET",
              name: "LedgerAccount",
              client: obj.client,
              callback: afterLedgerAccounts,
              filter: {
                criteria: [{
                  property: "id",
                  operator: "IN",
                  value: ids}]
              }
            };

            datasource.request(payload, true)
              .then(afterLedgerAccounts)
              .then(resolve)
              .catch(reject);
            return;
          }

          resolve();
        });
      }

      afterLedgerAccounts = function (resp) {
        return new Promise (function (resolve, reject) {
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

          getLedgerAccounts(ledgerAccountIds)
            .then(resolve)
            .catch(reject);
        });
      };

      function getCurrency () {
        return new Promise (function (resolve, reject) {
          var payload = {
              method: "GET",
              name: "Currency",
              client: obj.client,
              id: kind.id
            };

          function callback (resp) {
            if (!resp) { 
              reject("Invalid currency.");
              return;
            }

            currency = resp;
            resolve();
          }

          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });
      }

      function getTrialBalance (ids) {
        return new Promise (function (resolve, reject) {
          var payload = {
            method: "GET",
            name: "TrialBalance",
            client: obj.client,
            filter: {
              criteria: [{
                property: "kind",
                value: currency},{
                property: "parent.id",
                operator: "IN",
                value: ids},{
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
          };

          function callback (resp) {
            trialBalances = trialBalances.concat(resp);
            resolve();
          }

          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });  
      }

      function getTrialBalances () {
        return new Promise (function (resolve, reject) {
          var requests = [];

          // Retrieve profit/loss trial balances
          if (profitLossIds.length) {
            requests.push(getTrialBalance(profitLossIds));
          }

          // Retrieve balance sheet trial balances
          if (balanceSheetIds.length) {
            requests.push(getTrialBalance(balanceSheetIds));
          }

          Promise.all(requests)
            .then(resolve)
            .catch(reject);
        });
      }

      function postBalance () {
        return new Promise (function (resolve, reject) {
          var requests = [];

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
              var update,
                balances = trialBalances.filter(function (row) {
                  return row.parent.id === id;
                });

              if (!balances.length) {
                throw new Error("No open trial balance for account " + dist.node.code + "."); 
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

          // Add trial balance updates
          requests = trialBalances.map(function (balance) {
            var payload = {
                method: "POST",
                id: balance.id,
                name: "TrialBalance",
                client: obj.client,
                data: balance
              };

            return datasource.request(payload, true);
          });

          // Create the GL transaction
          var postGLTransaction = new Promise (function (resolve, reject) {
            var payload;

            transaction = {
              kind: journals[0].kind,
              date: date,
              note: data.note,
              distributions: distributions
            };

            payload = {
              method: "POST",
              name: "GeneralLedgerTransaction",
              client: obj.client,
              data: transaction      
            };

            function callback (resp) {
              jsonpatch.apply(transaction, resp);
              resolve();
            }

            datasource.request(payload, true)
              .then(callback)
              .catch(reject);
          });

          requests.push(postGLTransaction);

          Promise.all(requests)
            .then(resolve)
            .catch(reject);
        });
      }

      function updateJournal () {
        return new Promise (function (resolve, reject) {
          var requests;

          requests = journals.map(function (journal) {
            var payload = {
              method: "POST",
              name: "Journal",
              client: obj.client,
              id: journal.id,
              data: journal
            };

            journal.isPosted = true;
            journal.folio = transaction.number;

            return datasource.request(payload, true);
          });

          function callback () {
            resolve(true);
          }

          Promise.all(requests)
            .then(callback)
            .catch(reject);
        });
      }

      Promise.resolve()
        .then(getIds)
        .then(getJournals)
        .then(afterJournals)
        .then(getLedgerAccounts)
        .then(getCurrency)
        .then(getTrialBalances)
        .then(postBalance)
        .then(updateJournal)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "postJournals", doPostJournals);

}(datasource));
