/*global datasource*/
(function (datasource) {
  "strict";

  var doAfterUpsertLedgerAccount = function (obj) {
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

      Promise.all([
          getCurrency,
          getFiscalPeriod
        ])
        .then(createTrialBalance)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "LedgerAccount",
    doAfterUpsertLedgerAccount, datasource.TRIGGER_AFTER);

}(datasource));
