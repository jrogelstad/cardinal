/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    jsonpatch = require("fast-json-patch");

  var doUpsertLedgerAccount = function (obj) {
    var afterAccount, afterUpsertAccount, afterFiscalPeriod, afterCurrency,
      createTrialBalance, done, raiseError, periods, prev, currency, result,
      client = obj.client,
      callback = obj.callback,
      account = obj.data,
      id = account.id || f.createId(),
      period = null,
      n = 0,
      count = 3,
      found = false;

    afterAccount = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }

      count += 1;
      if (resp) { found = true; }

      datasource.request({
        method: "POST",
        name: "doUpsert",
        id: id,
        data: {
          name: "LedgerAccount",
          data: account
        },
        client: client,
        callback: afterUpsertAccount
      }, true);
    };

    afterUpsertAccount = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }

      jsonpatch.apply(account, resp);
      result = resp;
      if (n === count) { createTrialBalance(); }
    };

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
        callback(null, result);
      }
    };

    // Real work starts here
    if (!account.id) {
      datasource.request({
        method: "POST",
        name: "doInsert",
        data: {
          name: "LedgerAccount",
          data: account
        },
        client: client,
        callback: afterUpsertAccount
      }, true);
    } else {
      datasource.request({
        method: "GET",
        name: "LedgerAccount",
        client: client,
        callback: afterAccount,
        id: id
      }, true);
    }

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

  datasource.registerFunction("POST", "LedgerAccount", doUpsertLedgerAccount);

}(datasource));
