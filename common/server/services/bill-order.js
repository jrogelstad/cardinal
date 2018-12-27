/**
    Framework for building object relational database apps
    Copyright (C) 2018  John Rogelstad

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
/*global datasource, require, Promise*/
/*jslint es6*/
(function (datasource) {
    "strict";

    /**
      Bill order handler
    */
    function doHandleBillOrder(obj) {
        return new Promise(function (resolve) {
            var lines,
                newRec = obj.newRec,
                next = 1;

            if (!Array.isArray(newRec.lines)) {
                throw new Error("Lines must be an array");
            }

            // Make sure line numbers run sequentially from '1' (perhaps some deleted?)
            lines = newRec.lines.filter((line) => line && Number.isInteger(line.number));
            lines.sort(function (a, b) {
                return a.number - b.number;
            });
            next = 1;
            lines.forEach(function (line) {
                line.number = next;
                next += 1;
            });

            // Now number any lines that don't have a number
            lines = newRec.lines.filter((line) => line && !Number.isInteger(line.number));
            lines.forEach(function (line) {
                line.number = next;
                next += 1;
            });

            resolve();
        });
    }

    datasource.registerFunction("POST", "BillOrder", doHandleBillOrder,
            datasource.TRIGGER_BEFORE);

    datasource.registerFunction("PATCH", "BillOrder", doHandleBillOrder,
            datasource.TRIGGER_BEFORE);

}(datasource));