/*global datasource, require, Promise*/
/*jslint white, this*/
(function (datasource) {
    "strict";

    var jsonpatch = require("fast-json-patch");

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

    /** 
      Ledger Transaction insert handler
    */
    function doInsertLedgerTransaction(obj) {
        return new Promise(function (resolve, reject) {
            var payload = {
                method: "POST",
                name: "checkLedgerTransaction",
                client: obj.client,
                data: {
                    journal: obj.data
                }
            };

            // Validate
            datasource.request(payload, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "Journal", doInsertLedgerTransaction,
        datasource.TRIGGER_BEFORE);

    function doUpdateLedgerTransaction(obj) {
        return new Promise(function (resolve, reject) {
            function callback(result) {
                if(result.isPosted) {
                    throw new Error("Posted ledger transaction may not be edited.");
                }

                resolve();
            }

            datasource.request({
                    method: "GET",
                    name: "Journal",
                    id: obj.id,
                    client: obj.client
                }, true)
                .then(callback)
                .catch(reject);
        });
    }

    datasource.registerFunction("PATCH", "Journal", doUpdateLedgerTransaction,
        datasource.TRIGGER_BEFORE);

}(datasource));