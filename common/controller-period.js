/*global datasource, Promise*/
/*jslint node*/
(function (datasource) {
    "strict";

    var f = require("./common/core"),
        jsonpatch = require("fast-json-patch");

    function doBeforeInsertPeriod(obj) {
        return new Promise(function (resolve, reject) {
            if (obj.newRec.start === null || isNaN(new Date(obj.newRec.start))) {
                throw new Error("Valid start date is required.");
            }

            if (obj.newRec.end === null || isNaN(new Date(obj.newRec.end))) {
                throw new Error("Valid end date is required.");
            }

            if (new Date(obj.newRec.end) <= new Date(obj.newRec.start)) {
                throw new Error("Period end must be greater than start.");
            }

            var getFiscalPeriod = new Promise(function (resolve, reject) {
                var payload = {
                    method: "GET",
                    name: "Period",
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "end",
                            operator: "<",
                            value: obj.newRec.end
                        }, {
                            property: "objectType",
                            operator: "=",
                            value: obj.name
                        }],
                        sort: [{
                            property: "end",
                            order: "DESC"
                        }],
                        limit: 1
                    }
                };

                function callback(resp) {
                    if (resp.length && (new Date(obj.newRec.start) - new Date(resp[0].end)) / 86400000 !== 1) {
                        throw new Error("Period end may not overlap or leave gaps with the previous period.");
                    }

                    resolve();
                }

                datasource.request(payload, true)
                    .then(callback)
                    .catch(reject);
            });

            Promise.all([
                getFiscalPeriod
            ]).then(resolve).catch(reject);
        });
    }

    datasource.registerFunction("POST", "Period", doBeforeInsertPeriod,
            datasource.TRIGGER_BEFORE);

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
        return new Promise(function (resolve, reject) {
            var original, patches, getPeriod,
                    id = obj.data.id,
                    name = obj.data.feather || "Period",
                    client = obj.client;

            function getPreviousPeriod(resp) {
                return new Promise(function (resolve, reject) {
                    try {
                        if (!resp) {
                            throw "Period not found.";
                        }
                        if (resp.isClosed) {
                            throw "Period is already closed.";
                        }

                        original = f.copy(resp);
                        resp.isClosed = true;
                        patches = jsonpatch.compare(original, resp);

                        var prevPeriod = datasource.request.bind(null, {
                            method: "GET",
                            name: name,
                            client: client,
                            filter: {
                                criteria: [{
                                    property: "end",
                                    operator: "<",
                                    value: original.end,
                                    order: "DESC"
                                }, {
                                    property: "isClosed",
                                    value: false
                                }],
                                limit: 1
                            }
                        }, true);

                        prevPeriod().then(resolve).catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            function doUpdate(resp) {
                return new Promise(function (resolve, reject) {
                    try {
                        if (resp.length) {
                            throw "Previous period exists that is not closed.";
                        }

                        var update = datasource.request.bind(null, {
                            method: "POST",
                            name: "doUpdate",
                            id: id,
                            client: client,
                            data: {
                                name: "Period",
                                id: id,
                                data: patches
                            }
                        }, true);

                        update().then(resolve).catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            getPeriod = datasource.request.bind(null, {
                method: "GET",
                name: "Period",
                id: id,
                client: client
            }, true);

            // Real work starts here
            Promise.resolve()
                .then(getPeriod)
                .then(getPreviousPeriod)
                .then(doUpdate)
                .then(resolve)
                .catch(reject);
        });
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
        return new Promise(function (resolve, reject) {
            var original, patches, getPeriod,
                    id = obj.data.id,
                    name = obj.data.name || "Period",
                    client = obj.client;

            function getPreviousPeriod(resp) {
                return new Promise(function (resolve, reject) {
                    try {
                        if (!resp) {
                            throw "Period not found.";
                        }
                        if (!resp.isClosed) {
                            throw "Period is already open.";
                        }

                        original = f.copy(resp);
                        resp.isClosed = false;
                        patches = jsonpatch.compare(original, resp);

                        var prevPeriod = datasource.request.bind(null, {
                            method: "GET",
                            name: name,
                            client: client,
                            filter: {
                                criteria: [{
                                    property: "end",
                                    operator: ">",
                                    value: original.end,
                                    order: "DESC"
                                }, {
                                    property: "isClosed",
                                    value: true
                                }],
                                limit: 1
                            }
                        }, true);

                        prevPeriod().then(resolve).catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            function doUpdate(resp) {
                return new Promise(function (resolve, reject) {
                    try {
                        if (resp.length) {
                            throw "Subsequent period exists that is closed.";
                        }

                        var update = datasource.request.bind(null, {
                            method: "POST",
                            name: "doUpdate",
                            id: id,
                            client: client,
                            data: {
                                name: name,
                                id: id,
                                data: patches
                            }
                        }, true);

                        update().then(resolve).catch(reject);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            getPeriod = datasource.request.bind(null, {
                method: "GET",
                name: name,
                id: id,
                client: client
            }, true);

            // Real work starts here
            Promise.resolve()
                .then(getPeriod)
                .then(getPreviousPeriod)
                .then(doUpdate)
                .then(resolve)
                .catch(reject);
        });
    };

    datasource.registerFunction("POST", "openPeriod", doOpenPeriod);

}(datasource));