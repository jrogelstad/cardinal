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
/*jslint white, this*/
(function (datasource) {
    "strict";

    /**
      Check whether a passed ledger transaction is valid or not.
      Raises error if not.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.journal] Journal to check.
    */
    function doCheckLedgerTransaction (obj) {
        return new Promise(function (resolve, reject) {
            var sumcheck = 0,
                data = obj.data.journal;            

            if(!Array.isArray(data.distributions)) {
                reject("Distributions must be a valid array.");
                return;
            }

            if(!data.distributions.length) {
                reject("Distributions must not be empty.");
                return;
            }

            // Check distributions
            data.distributions.forEach(function (dist) {
                if(dist.debit.amount) {
                    if(dist.debit.amount <= 0) {
                        reject("Debit must be a positive number.");
                        return;
                    }

                    sumcheck = Math.subtract(
                        sumcheck,
                        dist.debit.amount
                    );
                }

                if(dist.credit.amount) {
                    if(dist.credit.amount <= 0) {
                        reject("Credit must be a positive number.");
                        return;
                    }

                    sumcheck = Math.add(
                        sumcheck,
                        dist.credit.amount
                    );
                }
            });

            // Check balance
            if(sumcheck !== 0) {
                reject("Distribution does not balance.");
                return;
            }

            // Everything passed
            resolve(true);
        });
    }

    datasource.registerFunction("POST", "checkLedgerTransaction", doCheckLedgerTransaction);
    
    function total (data) {
        var totalAmount = {
            amount: 0,
            currency: data.currency.code
        };
        data.distributions.forEach(function (item) {
            totalAmount.amount = Math.add(totalAmount.amount, item.debit.amount);
        });
        data.amount = totalAmount;
    }

    /** 
      Ledger Transaction insert handler
    */
    function doInsertLedgerTransaction(obj) {
        return new Promise(function (resolve, reject) {
            var payload,
                data = obj.newRec;
            
            payload = {
                method: "POST",
                name: "checkLedgerTransaction",
                client: obj.client,
                data: {
                    journal: data
                }
            };
            
            function callback () {
                if (!data.currency) {
                    throw "Currency is required for ledger transaction";
                }

                total(data);

                resolve();
            }                

            // Validate
            datasource.request(payload, true)
                .then(callback)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "LedgerTransaction", doInsertLedgerTransaction,
        datasource.TRIGGER_BEFORE);

    function doUpdateLedgerTransaction(obj) {
        return new Promise(function (resolve) {
            if(obj.oldRec.isPosted) {
                throw new Error("Posted ledger transaction may not be edited.");
            }

            // Calculate subtotal
            total(obj.newRec);
            
            resolve();
        });
    }

    datasource.registerFunction("PATCH", "LedgerTransaction", doUpdateLedgerTransaction,
        datasource.TRIGGER_BEFORE);

}(datasource));