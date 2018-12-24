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
/*jslint this, es6*/
(function (datasource) {
    "strict";

    /**
      Post a series of invoices and create journals.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Invoice data
      @param {Array} [payload.data.ids] Invoice ids to post. Default = all.
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostInvoices(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postBillSubledgers";
            obj.profile = {
                feather: "Invoice",
                billEntityAttr: "customer",
                freightDebitAccountType: "Receivables",
                freightCreditAccountType: "FreightOut",
                taxDebitAccountType: "Receivables",
                taxCreditAccountType: "TaxOut",
                itemDebitAccountType: "Receivables",
                itemCreditAccountType: "Revenue"
            };
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postInvoices", doPostInvoices);

    /**
      Post an invoice and create journal.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Invoice data
      @param {Object} [payload.data.id] Invoice id to post. Required
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostInvoice(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postBillSubledger";
            obj.feather = "Invoice";
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postInvoice", doPostInvoice);

}(datasource));