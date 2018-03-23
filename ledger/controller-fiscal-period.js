/*global datasource*/
(function (datasource) {
  "strict";

  var doAfterUpsertFiscalPeriod = function (obj) {
    return new Promise (function (resolve, reject) {
      var account, prevPeriod,
        accounts, currency, prevTrialBalance,
        fiscalPeriod = obj.data;

      function createTrialBalance () {
        return new Promise (function (resolve, reject) {
          var prev, balance, payload;

          if (!accounts.length) {
            resolve();
            return;
          }

          account = accounts.shift();
          prev = prevTrialBalance.find(function (row) {
            return row.parent.id === account.id;
          });
          balance = prev ? prev.balance : 0;
 
          payload = {
            method: "POST",
            name: "TrialBalance",
            client: obj.client,
            callback: createTrialBalance,
            data: {
              kind: currency,
              parent: account,
              period: fiscalPeriod,
              previous: prevPeriod,
              balance: balance
            }     
          };

          // Recursively work through accounts
          datasource.request(payload, true)
            .then(createTrialBalance)
            .catch(reject);
        });
      }

      var getCurrency = new Promise (function (resolve, reject) {
        var payload = {
            method: "GET",
            name: "Currency",
            client: obj.client,
            filter: {
              criteria: [{
                property: "isBase",
                value: true
              }]
            }
          };

        function callback (resp) {
          if (resp.length) {
            currency = resp[0];
            resolve();
          } else {
            reject("No base currency found");
          }
        }

        datasource.request( payload, true)
          .then(callback) 
          .catch(reject);
      });

      var getFiscalPeriod = new Promise (function (resolve, reject) {
        var payload = {
          method: "GET",
          name: "FiscalPeriod",
          client: obj.client,
          filter: {
            criteria: [{
              property: "end",
              operator: "<",
              value: fiscalPeriod.end
            }],
            sort: [{
              property: "end",
              order: "DESC"
            }],
            limit: 1
          }
        };

        function afterFiscalPeriod (resp) {
          return new Promise (function (resolve, reject) {
            if (resp.length) {
              prevPeriod = resp[0];
              if ((new Date(fiscalPeriod.start) - new Date(prevPeriod.end)) / 86400000 !== 1) {
                reject("Period end may not overlap or leave gaps with the previous period.");
                return;
              }
            }

            resolve();
          });
        }

        function getTrialBalance () {
          return new Promise (function (resolve, reject) {
            debugger;
            var cpayload = {
                method: "GET",
                name: "TrialBalance",
                client: obj.client,
                filter: {
                  criteria: [{
                    property: "kind.type",
                    operator: "IN",
                    value: ["Asset", "Liability", "Equity"]
                  }, {
                    property: "period",
                    value: prevPeriod
                  }]
                }
              };

            datasource.request(cpayload, true)
              .then(resolve)
              .catch(reject);
          });
        }

        function afterTrialBalance (resp) {
          prevTrialBalance = resp;
          resolve();
        }

        Promise.resolve()
          .then(datasource.request.bind(null, payload, true))
          .then(afterFiscalPeriod)
          .then(getTrialBalance)
          .then(afterTrialBalance)
          .catch(reject);
      });

      var getLedgerAccount = new Promise (function (resolve, reject) {
        var payload = {
            method: "GET",
            name: "LedgerAccount",
            client: obj.client
          };

        function callback (resp) {
          accounts = resp;
          resolve();
        }

        datasource.request(payload, true)
          .then(callback)
          .catch(reject);
      });

      Promise.all([
          getCurrency,
          getFiscalPeriod,
          getLedgerAccount
        ])
        .then(createTrialBalance)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "FiscalPeriod", doAfterUpsertFiscalPeriod,
    datasource.TRIGGER_AFTER);

  /**
    Close a fiscal period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id] Fiscal period id to close. Required
  */
  var doCloseFiscalPeriod = function (obj) {
    return new Promise (function (resolve, reject) {
      var payload = {
          method: "POST",
          name: "closePeriod",
          client: obj.client,
          callback: obj.callback,
          data: obj.data
        };

      obj.data.feather = "FiscalPeriod";
      datasource.request(payload, true)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "closeFiscalPeriod", doCloseFiscalPeriod);

  /**
    Reopen a fiscal period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id] Fiscal period id to open. Required
  */
  var doOpenFiscalPeriod = function (obj) {
    return new Promise (function (resolve, reject) {
      var payload = {
          method: "POST",
          name: "openPeriod",
          client: obj.client,
          data: obj.data
        };

      obj.data.feather = "FiscalPeriod";
      datasource.request(payload, true)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "openFiscalPeriod", doOpenFiscalPeriod);

  var doDeleteFiscalPeriod = function (obj) {
    return new Promise (function (resolve, reject) {
      var fiscalPeriod;

      // Validate
      function getFiscalPeriod () {
        return new Promise (function (resolve, reject) {
          var payload = {
              method: "GET",
              name: "FiscalPeriod",
              id: obj.id,
              client: obj.client
            };

          function callback (resp) {
            if (fiscalPeriod.isClosed) {
              reject("Can not delete a closed period.");
              return;
            }

            if (fiscalPeriod.isFrozen) {
              reject("Can not delete a frozen period.");
              return;
            }

            fiscalPeriod = resp;
            resolve();
          }

          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });
      }

      function getNextFiscalPeriod () {
        return new Promise (function (resolve, reject) {
          var payload = {
              method: "GET",
              name: "FiscalPeriod",
              client: obj.client,
              filter: {
                criteria: [{
                  property: "end",
                  operator: ">",
                  value: fiscalPeriod.end
                }],
                limit: 1
              }
            };

          function callback (resp) {
            if (resp.length) {
              reject("Can not delete a period with a subsequent period.");
              return;
            }

            resolve();
          }
          
          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });
      }

      function getTrialBalances () {
        return new Promise (function (resolve, reject) {
          var payload = {
              method: "GET",
              name: "TrialBalance",
              client: obj.client,
              filter: {
                criteria: [{
                  property: "period",
                  value: fiscalPeriod
                }]
              }
            };

          function callback (resp) {
            resp.forEach(function (trialBalance) {
              if (trialBalance.debits !== 0 ||
                  trialBalance.credits !== 0) {
                reject("Can not delete period with trial balance activity posted.");
                return;
              }
            });

            resolve(resp);
          }

          datasource.request(payload, true)
            .then(callback)
            .catch(reject);
        });
      }

      function doDeleteTrialBalances (resp) {
        return new Promise (function (resolve, reject) {
          var deletions;

          // Build array of deletion calls
          deletions = resp.map(function (trialBalance) {
            var payload = {
                method: "DELETE",
                name: "TrialBalance",
                client: obj.client,
                id: trialBalance.id
              };

            return datasource.request(payload, true);
          });

          Promise.all(deletions)
            .then(resolve)
            .catch(reject);
        });
      }

      Promise.resolve()
        .then(getFiscalPeriod)
        .then(getNextFiscalPeriod)
        .then(getTrialBalances)
        .then(doDeleteTrialBalances)
        .then(resolve.bind(null, true))
        .catch(reject);
    });
  };

  datasource.registerFunction("DELETE", "FiscalPeriod", doDeleteFiscalPeriod,
    datasource.TRIGGER_AFTER);

}(datasource));
