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
/*global datasource, Promise*/
/*jslint*/
(function (datasource) {
    "strict";

    var doBeforeDeleteBillSubledger = function (obj) {
        return new Promise(function (resolve) {
            if (obj.oldRec.isPosted) {
                throw new Error("Can not delete a posted " + obj.oldRec.objectType);
            }

            resolve();
        });
    };

    datasource.registerFunction("DELETE", "BillSubledger",
            doBeforeDeleteBillSubledger, datasource.TRIGGER_BEFORE);

}(datasource));
