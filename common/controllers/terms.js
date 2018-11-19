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
/*jslint*/
(function (datasource) {
    "strict";

    /**
      Terms handler
    */
    function doHandleTerms(obj) {
        return new Promise(function (resolve, reject) {
            var newRec = obj.newRec;

            try {
                switch (newRec.policy) {
                case "Prepay":
                case "Immediate":
                    newRec.net = 0;
                    newRec.day = 0;
                    newRec.discountDays = 0;
                    newRec.discount = 0;
                    break;
                case "Net":
                    newRec.net = 0;
                    break;
                case "DayOfMonth":
                    newRec.day = 0;
                    newRec.discountDays = 0;
                    newRec.discount = 0;
                    break;
                default:
                    throw new Error("Invalid terms policy " + newRec.polcy + ".");
                }

                if (!newRec.depositAmount) {
                    throw new Error("Deposit amount is required on terms.");
                }

                if (newRec.isDepositRequired) {
                    if (newRec.depositPercent === 0 && newRec.depositAmount.amount === 0) {
                        throw new Error("Deposit percent or amount must be positive when deposit required.");
                    }
                } else {
                    newRec.depositPercent = 0;
                    newRec.depositAmount.amount = 0;
                }

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    datasource.registerFunction("POST", "Terms", doHandleTerms,
            datasource.TRIGGER_BEFORE);

    datasource.registerFunction("PATCH", "Terms", doHandleTerms,
            datasource.TRIGGER_BEFORE);

}(datasource));