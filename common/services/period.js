/*global datasource, Promise*/
/*jslint node*/
(function (datasource) {
    "strict";

    function doHandlePeriod(obj) {
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

    datasource.registerFunction("POST", "Period", doHandlePeriod,
            datasource.TRIGGER_BEFORE);

    datasource.registerFunction("PATCH", "Period", doHandlePeriod,
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
            var newRec, getPeriod,
                    id = obj.data.id,
                    name = obj.data.feather || "Period",
                    client = obj.client;

            function getPreviousPeriod(resp) {
                return new Promise(function (resolve, reject) {
                    if (!resp) {
                        throw "Period not found.";
                    }
                    if (resp.status === "C") {
                        throw "Period is already closed.";
                    }

                    newRec = resp;
                    newRec.status = "C";

                    var prevPeriod = datasource.request.bind(null, {
                        method: "GET",
                        name: name,
                        client: client,
                        filter: {
                            criteria: [{
                                property: "end",
                                operator: "<",
                                value: newRec.end,
                                order: "DESC"
                            }, {
                                property: "status",
                                operator: "!=",
                                value: "C"
                            }],
                            limit: 1
                        }
                    }, true);

                    prevPeriod().then(resolve).catch(reject);
                });
            }

            function doUpdate(resp) {
                return new Promise(function (resolve, reject) {
                    if (resp.length) {
                        throw "Previous period exists that is not closed.";
                    }

                    datasource.request({
                        method: "POST",
                        name: "Period",
                        id: id,
                        client: client,
                        data: newRec
                    }, true).then(resolve).catch(reject);
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
            var newRec, getPeriod,
                    id = obj.data.id,
                    name = obj.data.name || "Period",
                    client = obj.client;

            function getPreviousPeriod(resp) {
                return new Promise(function (resolve, reject) {
                    if (!resp) {
                        throw "Period not found.";
                    }
                    if (resp.status === "O") {
                        throw "Period is already open.";
                    }

                    newRec = resp;
                    newRec.status = "O";

                    datasource.request({
                        method: "GET",
                        name: name,
                        client: client,
                        filter: {
                            criteria: [{
                                property: "end",
                                operator: ">",
                                value: newRec.end,
                                order: "DESC"
                            }, {
                                property: "status",
                                value: "C"
                            }],
                            limit: 1
                        }
                    }, true).then(resolve).catch(reject);
                });
            }

            function doUpdate(resp) {
                return new Promise(function (resolve, reject) {
                    if (resp.length) {
                        throw "Subsequent period exists that is closed.";
                    }

                    datasource.request({
                        method: "POST",
                        name: "Period",
                        id: id,
                        client: client,
                        data: newRec
                    }, true).then(resolve).catch(reject);
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