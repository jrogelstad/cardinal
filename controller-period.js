/*global datasource*/
(function (datasource) {
  "strict";

  var f = require("./common/core"),
    jsonpatch = require("fast-json-patch");

  /**
    Close a period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id]  period id to close. Required
    @param {Object} [payload.data.feather] Inheriting feather. Default is "Period"

  */
  var doClosePeriod = function (obj) {
    var afterPeriod, afterPrevPeriod, afterUpdate,
      original, patches,
      id = obj.data.id,
      name = obj.data.feather || "Period",
      client = obj.client,
      callback = obj.callback;

    afterPeriod = function (err, resp) {
      try {
        if (err) { throw err; }
        if (!resp) { throw "Period not found."; }
        if (resp.isClosed) { throw "Period is already closed."; }

        original = f.copy(resp);
        resp.isClosed = true;
        patches = jsonpatch.compare(original, resp);

        datasource.request({
          method: "GET",
          name: name,
          client: client,
          callback: afterPrevPeriod,
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

    afterPrevPeriod = function (err, resp) {
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
            name: "Period",
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
      name: "Period",
      id: id,
      client: client,
      callback: afterPeriod
    }, true);
  };

  datasource.registerFunction("POST", "closePeriod", doClosePeriod);

  /**
    Reopen a  period.

    @param {Object} [payload] Payload.
    @param {Object} [payload.client] Database client.
    @param {Function} [payload.callback] callback.
    @param {Object} [payload.data] Payload data
    @param {Object} [payload.data.id]  period id to open. Required
    @param {Object} [payload.data.feather] Inheriting feather. Default is "Period"
  */
  var doOpenPeriod = function (obj) {
    var afterPeriod, afterPrevPeriod, afterUpdate,
      original, patches,
      id = obj.data.id,
      name = obj.data.name || "Period",
      client = obj.client,
      callback = obj.callback;

    afterPeriod = function (err, resp) {
      try {
        if (err) { throw err; }
        if (!resp) { throw "Period not found."; }
        if (!resp.isClosed) { throw "Period is already open."; }

        original = f.copy(resp);
        resp.isClosed = false;
        patches = jsonpatch.compare(original, resp);

        datasource.request({
          method: "GET",
          name: name,
          client: client,
          callback: afterPrevPeriod,
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

    afterPrevPeriod = function (err, resp) {
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
            name: name,
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
      name: name,
      id: id,
      client: client,
      callback: afterPeriod
    }, true);
  };

  datasource.registerFunction("POST", "openPeriod", doOpenPeriod);

}(datasource));
