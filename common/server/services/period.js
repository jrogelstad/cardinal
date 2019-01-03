/**
    Framework for building object relational database apps
    Copyright (C) 2019  John Rogelstad

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/
/*jslint browser*/
/*global f*/

function doHandlePeriod(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        if (
            obj.newRec.start === null ||
            Number.isNaN(new Date(obj.newRec.start))
        ) {
            throw new Error("Valid start date is required.");
        }

        if (obj.newRec.end === null || Number.isNaN(new Date(obj.newRec.end))) {
            throw new Error("Valid end date is required.");
        }

        if (new Date(obj.newRec.end) <= new Date(obj.newRec.start)) {
            throw new Error("Period end must be greater than start.");
        }

        let getFiscalPeriod = new Promise(function (resolve, reject) {
            let payload = {
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
                if (
                    resp.length &&
                    (
                        new Date(obj.newRec.start) - new Date(resp[0].end)
                    ) / 86400000 !== 1
                ) {
                    throw new Error(
                        "Period end may not overlap or leave " +
                        "gaps with the previous period."
                    );
                }

                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        Promise.all([
            getFiscalPeriod
        ]).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "Period",
    doHandlePeriod,
    f.datasource.TRIGGER_BEFORE
);

f.datasource.registerFunction(
    "PATCH",
    "Period",
    doHandlePeriod,
    f.datasource.TRIGGER_BEFORE
);

/**
      Close a period.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Function} [payload.callback] callback.
      @param {Object} [payload.data] Payload data
      @param {Object} [payload.data.id]  period id to close. Required
      @param {Object} [payload.data.feather] Inheriting feather. Default
            is "Period"

    */
let doClosePeriod = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let newRec;
        let getPeriod;
        let id = obj.data.id;
        let name = obj.data.feather || "Period";
        let client = obj.client;

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

                let prevPeriod = f.datasource.request.bind(null, {
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

                f.datasource.request({
                    method: "POST",
                    name: "Period",
                    id: id,
                    client: client,
                    data: newRec
                }, true).then(resolve).catch(reject);
            });
        }

        getPeriod = f.datasource.request.bind(null, {
            method: "GET",
            name: "Period",
            id: id,
            client: client
        }, true);

        // Real work starts here
        Promise.resolve().then(
            getPeriod
        ).then(
            getPreviousPeriod
        ).then(
            doUpdate
        ).then(
            resolve
        ).catch(
            reject
        );
    });
};

f.datasource.registerFunction("POST", "closePeriod", doClosePeriod);

/**
  Reopen a  period.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Function} [payload.callback] callback.
  @param {Object} [payload.data] Payload data
  @param {Object} [payload.data.id]  period id to open. Required
  @param {Object} [payload.data.feather] Inheriting feather. Default is "Period"
*/
let doOpenPeriod = function (obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let newRec;
        let getPeriod;
        let id = obj.data.id;
        let name = obj.data.name || "Period";
        let client = obj.client;

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

                f.datasource.request({
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

                f.datasource.request({
                    method: "POST",
                    name: "Period",
                    id: id,
                    client: client,
                    data: newRec
                }, true).then(resolve).catch(reject);
            });
        }

        getPeriod = f.datasource.request.bind(null, {
            method: "GET",
            name: name,
            id: id,
            client: client
        }, true);

        // Real work starts here
        Promise.resolve().then(
            getPeriod
        ).then(
            getPreviousPeriod
        ).then(
            doUpdate
        ).then(
            resolve
        ).catch(
            reject
        );
    });
};

f.datasource.registerFunction("POST", "openPeriod", doOpenPeriod);
