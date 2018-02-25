/*global datasource*/
(function (datasource) {
  "strict";

  var doAfterUpsertLedgerAccount = function (obj) {
    var afterFiscalPeriod, afterCurrency,
      createTrialBalance, done, raiseError, periods, prev, currency,
      client = obj.client,
      callback = obj.callback,
      account = obj.data,
      period = null,
      n = 0,
      count = 2,
      found = false;

    afterCurrency = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }
      if (!resp.length) {
        done("No base currency found");
      }
      currency = resp[0];
      if (n === count) { createTrialBalance(); }
    };

    afterFiscalPeriod = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }
 
      periods = resp;
      if (n === count) { createTrialBalance(); }
    };

    createTrialBalance = function (err) {
      if (err) {
        done(err);
        return;
      }

      if (found || !periods.length) {
        done();
        return;
      }

      prev = period;
      period = periods.shift();

      datasource.request({
        method: "POST",
        name: "TrialBalance",
        client: client,
        callback: createTrialBalance,
        data: {
          kind: currency,
          parent: account,
          period: period,
          previous: prev
        }     
      }, true);
    };

    done = function (err) {
      if (err && !raiseError) {
        raiseError = err;
        return;
      }
      if (n === count) {
        if (raiseError) {
          callback(raiseError);
          return;
        }
        callback(null, obj);
      }
    };

    // Real work starts here
    datasource.request({
      method: "GET",
      name: "Currency",
      client: client,
      callback: afterCurrency,
      filter: {
        criteria: [{
          property: "isBase",
          value: true
        }]
      }
    }, true);

    datasource.request({
      method: "GET",
      name: "FiscalPeriod",
      client: client,
      callback: afterFiscalPeriod,
      filter: {
        order: [{property: "start"}]
      }
    }, true);
  };

  datasource.registerFunction("POST", "LedgerAccount",
    doAfterUpsertLedgerAccount, datasource.TRIGGER_AFTER);

}(datasource));
