/*global datasource*/
(function (datasource) {
  "strict";

  var doAfterInsertLedgerAccount = function (obj) {
    return new Promise (function (resolve, reject) {
      var periods, prev, currency,
        account = obj.data,
        period = null;

      function createTrialBalance () {
        return new Promise (function (resolve, reject) {
          var payload;

          if (!periods.length) {
            resolve();
            return;
          }

          prev = period;
          period = periods.shift();
          payload = {
            method: "POST",
            name: "TrialBalance",
            client: obj.client,
            data: {
              kind: currency,
              parent: account,
              period: period,
              previous: prev
            }     
          };

          Promise.resolve()
            .then(datasource.request.bind(null, payload, true))
            .then(createTrialBalance)
            .then(resolve)
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
          if (!resp.length) {
            reject("No base currency found");
            return;
          }

          currency = resp[0];
          resolve();
        }

        datasource.request(payload, true)
          .then(callback)
          .catch(reject);
      });

      var getFiscalPeriod = new Promise (function (resolve, reject) {
        var payload = {
            method: "GET",
            name: "FiscalPeriod",
            client: obj.client,
            filter: {
              order: [{property: "start"}]
            }
          };

        function callback (resp) {
          periods = resp;
          resolve();
        }

        datasource.request(payload, true)
          .then(callback)
          .catch(reject);
      });

      function updateParent (parent) {
        return new Promise (function (resolve, reject) {
          if (!parent) {
            reject("Parent not found.");
            return;
          }

          var payload = {
            method: "POST",
            name: "LedgerAccount",
            client: obj.client,
            id: parent.id,
            data: parent  
          };

          if (!parent.isParent) {
            parent.isParent = true;

            datasource.request(payload, true)
              .then(resolve)
              .catch(reject);

            return;
          }

          resolve();
        });
      }

      function getParent () {
        return new Promise (function (resolve, reject) {
          if (account.parent &&
              account.parent.id !== undefined && 
              account.parent.id !== null) {
            var payload = {
                method: "GET",
                name: "LedgerAccount",
                client: obj.client,
                id: account.parent.id
              };

            datasource.request(payload, true)
              .then(updateParent)
              .then(resolve)
              .catch(reject);

            return;
          }

          resolve();
        });
      }

      Promise.all([
          getCurrency,
          getFiscalPeriod
        ])
        .then(createTrialBalance)
        .then(getParent)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "LedgerAccount",
    doAfterInsertLedgerAccount, datasource.TRIGGER_AFTER);

}(datasource));
