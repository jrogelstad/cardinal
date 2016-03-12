/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    jsonpatch = require("fast-json-patch");

  var doUpsertFiscalPeriod = function (obj) {
    var afterPrevPeriod, afterUpsertPeriod,
      afterFiscalPeriod, afterCurrency, afterLedgerAccount,
      account, prevPeriod, createTrialBalance, done,
      raiseError, accounts, currency, result, prevTrialBalance,
      client = obj.client,
      callback = obj.callback,
      fiscalPeriod = obj,
      id = fiscalPeriod.id || f.createId(),
      n = 0,
      count = 4,
      found = false;

    delete fiscalPeriod.client;
    delete fiscalPeriod.callback;

    afterFiscalPeriod = function (err, resp) {
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
          name: "FiscalPeriod",
          data: fiscalPeriod
        },
        client: client,
        callback: afterUpsertPeriod
      }, true);
    };

    afterPrevPeriod = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }

      var afterTrialBalance = function (err, resp) {
          if (err) {
            done(err);
            return;
          }
          prevTrialBalance = resp;
          if (n === count) { createTrialBalance(); }
        };

      if (resp.length) {
        prevPeriod = resp[0];
      }

      datasource.request({
        method: "GET",
        name: "TrialBalance",
        client: client,
        callback: afterTrialBalance,
        filter: {
          criteria: [{
            property: "container.type",
            operator: "IN",
            value: ["Asset", "Liability", "Equity"]
          }, {
            property: "period",
            value: prevPeriod
          }]
        }
      }, true);
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

    afterLedgerAccount = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }

      accounts = resp;
      if (n === count) { createTrialBalance(); }
    };

    afterUpsertPeriod = function (err, resp) {
      n += 1;
      if (err) {
        done(err);
        return;
      }

      jsonpatch.apply(fiscalPeriod, resp);
      result = resp;
      if (n === count) { createTrialBalance(); }
    };

    createTrialBalance = function (err) {
      var prev, balance;

      if (err) {
        done(err);
        return;
      }

      if (found || !accounts.length) {
        done();
        return;
      }

      account = accounts.shift();
      prev = prevTrialBalance.find(function (row) {
        return row.container.id === account.id;
      });
      balance = prev ? prev.balance : 0;

      datasource.request({
        method: "POST",
        name: "TrialBalance",
        client: client,
        callback: createTrialBalance,
        data: {
          node: currency,
          container: account,
          period: fiscalPeriod,
          previous: prevPeriod,
          balance: balance
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
    if (!fiscalPeriod.id) {
      datasource.request({
        method: "POST",
        name: "doInsert",
        data: {
          name: "FiscalPeriod",
          data: fiscalPeriod
        },
        client: client,
        callback: afterUpsertPeriod
      }, true);
    } else {
      datasource.request({
        method: "GET",
        name: "FiscalPeriod",
        client: client,
        callback: afterFiscalPeriod,
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
      callback: afterPrevPeriod,
      filter: {
        sort: [{
          property: "end",
          operator: "<",
          value: fiscalPeriod.end,
          order: "DESC"
        }],
        limit: 1
      }
    }, true);

    datasource.request({
      method: "GET",
      name: "LedgerAccount",
      client: client,
      callback: afterLedgerAccount
    }, true);
  };

  datasource.registerFunction("POST", "FiscalPeriod", doUpsertFiscalPeriod);

}(datasource));
