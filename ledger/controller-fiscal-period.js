/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    jsonpatch = require("fast-json-patch");

  var doUpsertFiscalPeriod = function (obj) {
    var afterPrevPeriod, afterUpsertPeriod, proposed, actual,
      afterFiscalPeriod, afterCurrency, afterLedgerAccount,
      account, prevPeriod, createTrialBalance, done,
      raiseError, accounts, currency, result, prevTrialBalance,
      client = obj.client,
      callback = obj.callback,
      fiscalPeriod = obj.data,
      id = fiscalPeriod.id || f.createId(),
      n = 0,
      count = 4,
      found = false;

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

      count += 1;

      var afterTrialBalance = function (err, resp) {
          n += 1;
          if (err) {
            done(err);
            return;
          }
          prevTrialBalance = resp;
          if (n === count) { createTrialBalance(); }
        };

      if (resp.length) {
        prevPeriod = resp[0];
        if ((new Date(fiscalPeriod.start) - new Date(prevPeriod.end)) / 86400000 !== 1) {
          done("Period end may not overlap or leave gaps with the previous period.");
        }
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

      // Update fiscal period for later reference
      jsonpatch.apply(fiscalPeriod, resp);

      // Resolve changes from original request
      jsonpatch.apply(actual, resp);
      result = jsonpatch.compare(proposed, actual);

      if (n === count) { createTrialBalance(); }
    };

    createTrialBalance = function (err) {
      var prev, balance;

      if (err) {
        done(err);
        return;
      }

      if (raiseError || found || !accounts.length) {
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
    // These attributes _must_ be default
    proposed = f.copy(fiscalPeriod);
    delete fiscalPeriod.isFrozen;
    delete fiscalPeriod.isClosed;
    actual = f.copy(fiscalPeriod);

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

  var doUpdateFiscalPeriod = function (obj) {
    var afterFiscalPeriod, afterUpdate, proposed, patches, actual, original,
      client = obj.client,
      callback = obj.callback,
      fiscalPeriod = obj.data,
      id = fiscalPeriod.id;

    afterFiscalPeriod = function (err, resp) {
      if (err) {
        callback(err);
        return;
      }

      original = f.copy(resp);
      jsonpatch.apply(resp, obj);
      proposed = f.copy(resp);
      resp.start = original.start;
      resp.end = original.end;
      resp.isClosed = original.isClosed;
      resp.isFrozen = original.isFrozen;
      actual = f.copy(resp);
      patches = jsonpatch.compare(original, resp);

      datasource.request({
        method: "POST",
        name: "doUpdate",
        client: client,
        callback: afterUpdate,
        id: id,
        data: {
          name: "FiscalPeriod",
          data: patches
        }
      });
    };

    afterUpdate = function (err, resp) {
      if (err)  {
        callback(err);
        return;
      }

      jsonpatch.apply(actual, resp);
      patches = jsonpatch.compare(proposed, actual);
      callback(null, patches);
    };

    datasource.request({
      method: "GET",
      name: "FiscalPeriod",
      client: client,
      callback: afterFiscalPeriod,
      id: id
    }, true);
  };

  datasource.registerFunction("PATCH", "FiscalPeriod", doUpdateFiscalPeriod);

  /**
    Close a fiscal period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id] Fiscal period id to close. Required
  */
  var doCloseFiscalPeriod = function (obj) {
    var afterFiscalPeriod, afterPrevFiscalPeriod, afterUpdate,
      original, patches,
      id = obj.data.id,
      client = obj.client,
      callback = obj.callback;

    afterFiscalPeriod = function (err, resp) {
      try {
        if (err) { throw err; }
        if (!resp) { throw "Period not found."; }
        if (resp.isClosed) { throw "Period is already closed."; }

        original = f.copy(resp);
        resp.isClosed = true;
        patches = jsonpatch.compare(original, resp);

        datasource.request({
          method: "GET",
          name: "FiscalPeriod",
          client: client,
          callback: afterPrevFiscalPeriod,
          filter: {
            criteria: [{
              property: "end",
              operator: "<",
              value: original.end,
              order: "DESC"
            },{
              property: "isClosed",
              value: false
            }],
            limit: 1
          }
        }, true);
      } catch (e) {
        callback(e);
      }
    };

    afterPrevFiscalPeriod = function (err, resp) {
      try {
        if (err) { throw err; }

        if (resp.length) {
          throw "Previous period exists that is not closed.";
        }

        datasource.request({
          method: "POST",
          name: "doUpdate",
          id: id,
          client: client,
          callback: afterUpdate,
          data: {
            name: "FiscalPeriod",
            id: id,
            data: patches
          }
        }, true);
      } catch (e) {
        callback(e);
      }
    };

    afterUpdate = function (err) {
      callback(err, true);
    };

    // Real work starts here
    datasource.request({
      method: "GET",
      name: "FiscalPeriod",
      id: id,
      client: client,
      callback: afterFiscalPeriod
    }, true);
  };

  datasource.registerFunction("POST", "closeFiscalPeriod", doCloseFiscalPeriod);

  /**
    Reopen a fiscal period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id] Fiscal period id to open. Required
  */
  var doOpenFiscalPeriod = function (obj) {
    var afterFiscalPeriod, afterPrevFiscalPeriod, afterUpdate,
      original, patches,
      id = obj.data.id,
      client = obj.client,
      callback = obj.callback;

    afterFiscalPeriod = function (err, resp) {
      try {
        if (err) { throw err; }
        if (!resp) { throw "Period not found."; }
        if (!resp.isClosed) { throw "Period is already open."; }

        original = f.copy(resp);
        resp.isClosed = false;
        patches = jsonpatch.compare(original, resp);

        datasource.request({
          method: "GET",
          name: "FiscalPeriod",
          client: client,
          callback: afterPrevFiscalPeriod,
          filter: {
            criteria: [{
              property: "end",
              operator: ">",
              value: original.end,
              order: "DESC"
            },{
              property: "isClosed",
              value: true
            }],
            limit: 1
          }
        }, true);
      } catch (e) {
        callback(e);
      }
    };

    afterPrevFiscalPeriod = function (err, resp) {
      try {
        if (err) { throw err; }

        if (resp.length) {
          throw "Subsequent period exists that is closed.";
        }

        datasource.request({
          method: "POST",
          name: "doUpdate",
          id: id,
          client: client,
          callback: afterUpdate,
          data: {
            name: "FiscalPeriod",
            id: id,
            data: patches
          }
        }, true);
      } catch (e) {
        callback(e);
      }
    };

    afterUpdate = function (err) {
      callback(err, true);
    };

    // Real work starts here
    datasource.request({
      method: "GET",
      name: "FiscalPeriod",
      id: id,
      client: client,
      callback: afterFiscalPeriod
    }, true);
  };

  datasource.registerFunction("POST", "openFiscalPeriod", doOpenFiscalPeriod);

}(datasource));
