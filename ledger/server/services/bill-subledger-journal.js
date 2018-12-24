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

    function doBeforeDeleteBillSubledgerJournal(obj) {
        return new Promise(function (resolve, reject) {
            var documents = [];

            function getDocumentIds() {
                return new Promise(function (resolve, reject) {
                    var payload = {
                        method: "GET",
                        name: "BillSubledger",
                        client: obj.client,
                        properties: ["id", "objectType"],
                        filter: {
                            criteria: [{
                                property: "journal.id",
                                operator: "=",
                                value: obj.id
                            }]
                        }
                    };

                    datasource.request(payload, true)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function getDocuments(resp) {
                return new Promise(function (resolve, reject) {
                    var requests = [];

                    // Have to get documents by their respective object type
                    // because only those include line items
                    resp.forEach(function (row) {
                        var payload = {
                            method: "GET",
                            name: row.objectType,
                            client: obj.client,
                            id: row.id
                        };

                        function callback(resp) {
                            return new Promise(function (resolve) {
                                documents.push(resp);
                                resolve();
                            });
                        }

                        requests.push(datasource.request(payload, true)
                            .then(callback));
                    });

                    Promise.all(requests)
                        .then(resolve)
                        .catch(reject);
                });
            }

            function updateDocuments() {
                return new Promise(function (resolve, reject) {
                    var requests = [];

                    // Update all documents to pre-posted state
                    documents.forEach(function (doc) {
                        if (doc.status === "C") {
                            throw "Journal can not be deleted because related document" + doc.number + " is closed.";
                        }

                        if (doc.balance.amount !== doc.total.amount) {
                            throw "Journal can not be deleted because related document" + doc.number + " has payment history.";
                        }

                        doc.status = "U";
                        doc.isPosted = false;
                        doc.postedDate = null;
                        doc.balance.amount = 0;
                        doc.balance.baseAmount = null;
                        doc.balance.effective = null;
                        doc.baseBalance.amount = 0;
                        doc.baseBalance.baseAmount = null;
                        doc.baseBalance.effective = null;
                        doc.freight.baseAmount = null;
                        doc.freight.effective = null;
                        doc.tax.baseAmount = null;
                        doc.tax.effective = null;
                        doc.subtotal.baseAmount = null;
                        doc.subtotal.effective = null;
                        doc.total.baseAmount = null;
                        doc.total.effective = null;
                        doc.journal = null;

                        doc.lines.forEach(function (line) {
                            line.price.baseAmount = null;
                            line.price.effective = null;
                            line.extended.baseAmount = null;
                            line.extended.effective = null;
                        });

                        // Request update of document
                        requests.push(new Promise(function (resolve, reject) {
                            var payload = {
                                method: "POST",
                                name: doc.objectType,
                                client: obj.client,
                                id: doc.id,
                                data: doc
                            };

                            datasource.request(payload, true)
                                .then(resolve)
                                .catch(reject);
                        }));
                    });

                    Promise.all(requests)
                        .then(resolve)
                        .catch(reject);
                });
            }

            Promise.resolve()
                .then(getDocumentIds)
                .then(getDocuments)
                .then(updateDocuments)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("DELETE", "BillSubledgerJournal", doBeforeDeleteBillSubledgerJournal,
            datasource.TRIGGER_BEFORE);

}(datasource));