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
/*jslint browser, this*/
/*global f*/

function calculateTotals(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let data = obj.newRec;

        if (!data.currency) {
            throw "Currency is required for subledger";
        }

        function getCurrency() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "GET",
                    name: "Currency",
                    id: data.currency.id,
                    client: obj.client
                };

                f.datasource.request(payload, true).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        function calculate(currency) {
            let lines;

            if (!currency) {
                throw "Currency not found";
            }

            data.subtotal = {
                amount: 0,
                currency: currency.code
            };

            data.total = {
                amount: 0,
                currency: currency.code
            };

            if (!data.freight) {
                data.freight = {
                    amount: 0,
                    currency: currency.code
                };
            }

            if (!data.tax) {
                data.tax = {
                    amount: 0,
                    currency: currency.code
                };
            }

            // Exclude deleted
            lines = data.lines.filter((line) => line !== null);
            lines.forEach(function (line) {
                if (line.billed === undefined) {
                    throw "Billed quantity is required.";
                }

                if (!line.price) {
                    line.price = {
                        amount: 0,
                        currency: currency.code
                    };
                }

                line.extended = {
                    amount: 0,
                    currency: currency.code
                };

                line.extended.amount = line.billed.times(
                    line.price.amount
                ).round(
                    data.currency.minorUnit
                );

                data.subtotal.amount = data.subtotal.amount.plus(
                    line.extended.amount
                );
            });

            data.total.amount = data.freight.amount.plus(
                data.tax.amount
            ).plus(
                data.subtotal.amount
            );

            resolve();
        }

        getCurrency().then(calculate).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "BillSubledger",
    calculateTotals,
    f.datasource.TRIGGER_BEFORE
);

function doUpdateBillSubledeger(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        if (obj.oldRec.isPosted) {
            throw new Error("Posted subledger may not be edited.");
        }

        calculateTotals(obj).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "PATCH",
    "BillSubledger",
    doUpdateBillSubledeger,
    f.datasource.TRIGGER_BEFORE
);

function doBeforeDeleteBillSubledger(obj) {
    "use strict";

    return new Promise(function (resolve) {
        if (obj.oldRec.isPosted) {
            throw new Error(
                "Can not delete a posted " + obj.oldRec.objectType
            );
        }

        resolve();
    });
}

f.datasource.registerFunction(
    "DELETE",
    "BillSubledger",
    doBeforeDeleteBillSubledger,
    f.datasource.TRIGGER_BEFORE
);

/**
  Post a series of billing subledgers and create journals.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Object} [payload.data] Subledger data
  @param {Array} [payload.data.ids] Subledger ids to post. Default = all.
  @param {String} [payload.profile.feather] Subledger feather type.
  @param {String} [payload.profile.billEntityAttr] Bill entity attribute.
  @param {String} [payload.profile.freghtDebitAccountType] Account map type
        for debiting freight
  @param {String} [payload.profile.freightCreditAccountType] Account map type
        for crediting freight
  @param {String} [payload.profile.taxDebitAccountType] Account map type for
        debiting tax
  @param {String} [payload.profile.taxCreditAccountType] Account map type for
        crediting tax
  @param {String} [payload.profile.itemDebitAccountType] Account map type for
        debiting line items
  @param {String} [payload.profile.itemCreditAccountType] Account map type for
        crediting line tems
  @param {Object} [payload.data.date] Post date. Default today.
*/
function doPostBillSubledgers(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        let baseCurrency;
        let categories;
        let accountMaps;
        let documents;
        let ids;
        let getBaseCurrency;
        let getIds;
        let getCategories;
        let getAccountMaps;
        let distributions = [];
        let journalId = f.createId();
        let postDate = obj.data.date || f.today();

        getBaseCurrency = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "baseCurrency",
                client: obj.client
            };

            function callback(resp) {
                baseCurrency = resp;
                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        getCategories = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "Category",
                client: obj.client
            };

            function callback(resp) {
                categories = resp;
                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        getAccountMaps = new Promise(function (resolve, reject) {
            let payload = {
                method: "GET",
                name: "AccountMap",
                client: obj.client
            };

            function callback(resp) {
                accountMaps = resp;
                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        getIds = new Promise(function (resolve, reject) {
            // If ids were passed use those
            if (Array.isArray(obj.data.ids)) {
                ids = obj.data.ids;
                resolve();
                return;
            }

            // Otherwise go get all unposted
            let payload = {
                method: "GET",
                name: obj.profile.feather,
                client: obj.client,
                filter: {
                    criteria: [{
                        property: "isPosted",
                        operator: "=",
                        value: false
                    }]
                }
            };

            function callback(resp) {
                ids = resp.map((row) => row.id);
                resolve();
            }

            f.datasource.request(payload, true).then(callback).catch(reject);
        });

        function resolveAccount(type, category, site, recursive) {
            let found;
            let currCategory;

            if (!type) {
                throw new Error("No account mapping type specificed");
            }

            if (site && category) {
                found = accountMaps.find(
                    (map) => (
                        map.type.code === type &&
                        map.type.category &&
                        map.type.category.id === category.id &&
                        map.type.site &&
                        map.type.site.id === site.id
                    )
                );
            } else if (site) {
                found = accountMaps.find(
                    (map) => (
                        map.type.code === type &&
                        map.type.site &&
                        map.type.site.id === site.id
                    )
                );
            } else if (category) {
                found = accountMaps.find(
                    (map) => (
                        map.type.code === type &&
                        map.type.category &&
                        map.type.category.id === category.id
                    )
                );
            } else {
                found = accountMaps.find(
                    (map) => map.type.code === type
                );
            }

            if (found) {
                if (found.account.isParent) {
                    throw new Error(
                        "Cannot post to parent account " + found.account.code +
                        " - " + found.account.description
                    );
                }

                return found.account;
            }

            // Not found so traverse up to the parent and see if there's a map
            // there
            if (site && category) {
                currCategory = categories.find(
                    (cat) => cat.id === category.id
                );

                if (currCategory.parent) {
                    found = resolveAccount(
                        type,
                        currCategory.parent,
                        site,
                        true
                    );
                } else if (recursive) {
                    return;
                }

                if (found) {
                    return found;

                // No site and parent match, try category only
                } else {
                    return resolveAccount(type, category);
                }
            }

            // No site, so try to find parent match only on category
            if (category) {
                currCategory = categories.find(
                    (cat) => cat.id === category.id
                );

                if (currCategory && currCategory.parent) {
                    return resolveAccount(
                        type,
                        currCategory.parent,
                        undefined,
                        true
                    );

                // No category or parent match, try default map
                } else {
                    return resolveAccount(type);
                }
            }

            // No more options...
            throw new Error("Can not resolve account type " + type);
        }

        function getDocuments() {
            return new Promise(function (resolve, reject) {
                let payload = {
                    method: "GET",
                    name: obj.profile.feather,
                    client: obj.client,
                    filter: {
                        criteria: [{
                            property: "id",
                            operator: "IN",
                            value: ids
                        }]
                    }
                };

                f.datasource.request(payload, true).then(resolve).catch(reject);
            });
        }

        function createJournal(resp) {
            return new Promise(function (resolve, reject) {
                let requests = [];

                documents = resp;

                function distribute(
                    debitType,
                    debitCategory,
                    debitSite,
                    creditType,
                    creditCategory,
                    creditSite,
                    currency,
                    money,
                    effective
                ) {
                    return new Promise(function (resolve, reject) {
                        let payload = {
                            method: "GET",
                            name: "convertCurrency",
                            client: obj.client,
                            data: {
                                fromCurrency: currency.code,
                                amount: money.amount,
                                effective: effective
                            }
                        };

                        if (money.amount === 0) {
                            resolve(money);
                            return;
                        }

                        function callback(money) {
                            let found;
                            let debitAccount = resolveAccount(
                                debitType,
                                debitCategory,
                                debitSite
                            );
                            let creditAccount = resolveAccount(
                                creditType,
                                creditCategory,
                                creditSite
                            );

                            found = distributions.find(
                                (dist) => (
                                    dist.account.id === debitAccount.id &&
                                    dist.debit.amount > 0
                                )
                            );

                            // Handle debit
                            if (found) {
                                found.debit.amount = found.debit.amount.plus(
                                    money.amount
                                );
                            } else {
                                distributions.push({
                                    account: debitAccount,
                                    debit: f.copy(money),
                                    credit: {
                                        amount: 0,
                                        currency: money.currency
                                    }
                                });
                            }

                            // Handle credit
                            found = distributions.find(
                                (dist) => (
                                    dist.account.id === creditAccount.id &&
                                    dist.credit.amount > 0
                                )
                            );

                            if (found) {
                                found.credit.amount = found.credit.amount.plus(
                                    money.amount
                                );
                            } else {
                                distributions.push({
                                    account: creditAccount,
                                    debit: {
                                        amount: 0,
                                        currency: money.currency
                                    },
                                    credit: f.copy(money)
                                });
                            }

                            resolve(money);
                        }

                        if (currency.code !== baseCurrency.code) {
                            f.datasource.request(payload, true).then(
                                callback
                            ).catch(
                                reject
                            );
                        } else {
                            callback(money);
                        }
                    });
                }

                function postJournal() {
                    return new Promise(function (resolve, reject) {
                        let payload = {
                            method: "POST",
                            name: "ReceivablesJournal",
                            client: obj.client,
                            data: {
                                id: journalId,
                                currency: baseCurrency,
                                date: postDate,
                                distributions: distributions
                            }
                        };

                        if (!distributions.length) {
                            resolve();
                            return;
                        }

                        f.datasource.request(payload, true).then(
                            resolve
                        ).catch(
                            reject
                        );
                    });
                }

                // Create distributions for each document
                documents.forEach(function (doc) {
                    let isNotBase = doc.currency.code !== baseCurrency.code;

                    function updateFreight(money) {
                        return new Promise(function (resolve) {
                            if (isNotBase) {
                                doc.freight.effective = postDate;
                                doc.freight.baseAmount = money.amount;
                            }
                            resolve();
                        });
                    }

                    function updateTax(money) {
                        return new Promise(function (resolve) {
                            if (isNotBase) {
                                doc.tax.effective = postDate;
                                doc.tax.baseAmount = money.amount;
                            }

                            resolve();
                        });
                    }

                    if (isNotBase) {
                        doc.subtotal.effective = postDate;
                        doc.subtotal.baseAmount = 0;
                    }

                    // Distribute freight
                    requests.push(distribute(
                        obj.profile.freightDebitAccountType,
                        doc[obj.profile.billEntityAttr].category,
                        doc.site,
                        obj.profile.freightCreditAccountType,
                        doc[obj.profile.billEntityAttr].category,
                        doc.site,
                        doc.currency,
                        doc.freight,
                        postDate
                    ).then(updateFreight));

                    // Distribute tax
                    requests.push(distribute(
                        obj.profile.taxDebitAccountType,
                        doc[obj.profile.billEntityAttr].category,
                        doc.site,
                        obj.profile.taxCreditAccountType,
                        doc[obj.profile.billEntityAttr].category,
                        doc.site,
                        doc.currency,
                        doc.tax,
                        postDate
                    ).then(updateTax));

                    // Create distributions for each line
                    doc.lines.forEach(function (line) {
                        function updateLine(money) {
                            return new Promise(function (resolve) {
                                let dsub = doc.subtotal;

                                if (isNotBase) {
                                    line.extended.effective = postDate;
                                    line.extended.baseAmount = money.amount;
                                    dsub.baseAmount = dsub.baseAmount.plus(
                                        money.amount
                                    );
                                }
                                resolve();
                            });
                        }

                        function updatePrice() {
                            return new Promise(function (resolve, reject) {
                                let payload = {
                                    method: "GET",
                                    name: "convertCurrency",
                                    client: obj.client,
                                    data: {
                                        fromCurrency: doc.currency.code,
                                        amount: line.price.amount,
                                        effective: postDate
                                    }
                                };

                                function callback(money) {
                                    if (isNotBase) {
                                        line.price.effective = postDate;
                                        line.price.baseAmount = money.amount;
                                    }
                                    resolve();
                                }

                                f.datasource.request(payload, true).then(
                                    callback
                                ).catch(
                                    reject
                                );
                            });
                        }

                        requests.push(distribute(
                            obj.profile.itemDebitAccountType,
                            doc[obj.profile.billEntityAttr].category,
                            doc.site,
                            obj.profile.itemCreditAccountType,
                            line.item.category,
                            line.item.site,
                            doc.currency,
                            line.extended,
                            postDate
                        ).then(
                            updateLine
                        ).then(
                            updatePrice
                        ));
                    });
                });

                Promise.all(requests).then(
                    postJournal
                ).then(
                    resolve
                ).catch(
                    reject
                );
            });
        }

        function updateDocuments() {
            return new Promise(function (resolve, reject) {
                let requests = documents.map(function (doc) {
                    let payload = {
                        method: "POST",
                        name: obj.profile.feather,
                        client: obj.client,
                        id: doc.id,
                        data: doc
                    };

                    if (distributions.length) {
                        doc.journal = {
                            id: journalId
                        };
                    }

                    if (doc.currency.code !== baseCurrency.code) {
                        doc.total.effective = postDate;
                        doc.total.baseAmount = doc.subtotal.baseAmount.plus(
                            doc.freight.baseAmount
                        ).plus(doc.tax.baseAmount);
                    }

                    doc.isPosted = true;
                    doc.status = "O";
                    doc.postedDate = postDate;
                    doc.balance = doc.total;
                    doc.baseBalance = doc.total;

                    return f.datasource.request(payload, true);
                });

                Promise.all(requests).then(
                    resolve.bind(null, true)
                ).catch(
                    reject
                );
            });
        }

        Promise.all([
            getBaseCurrency,
            getCategories,
            getAccountMaps,
            getIds
        ]).then(
            getDocuments
        ).then(
            createJournal
        ).then(
            updateDocuments
        ).then(
            resolve
        ).catch(
            reject
        );
    });
}

f.datasource.registerFunction(
    "POST",
    "postBillSubledgers",
    doPostBillSubledgers
);

/**
  Post a billing subledger and create journal.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Object} [payload.data] Subledger data
  @param {Object} [payload.data.id] Subledger id to post. Required
  @param {Object} [payload.data.date] Post date. Default today.
*/
function doPostBillSubledger(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        if (!obj.data || !obj.data.id) {
            reject("Id must be provided");
            return;
        }

        obj.data.ids = [obj.data.id];
        delete obj.data.id;

        doPostBillSubledgers(obj).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "postBillSubledger",
    doPostBillSubledger
);