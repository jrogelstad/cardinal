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
      Post a series of credit memos and create journals.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Credit memo data
      @param {Array} [payload.data.ids] Credit memo ids to post. Default = all.
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostCreditMemos(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postReceivables";
            obj.profile = {
                feather: "CreditMemo",
                freightDebitAccountType: "FreightOut",
                freightCreditAccountType: "Receivables",
                taxDebitAccountType: "TaxOut",
                taxCreditAccountType: "Receivables",
                itemDebitAccountType: "Revenue",
                itemCreditAccountType: "Receivables"
            };
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postCreditMemos", doPostCreditMemos);

    /**
      Post a credit memo and create journal.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Credit memo data
      @param {Object} [payload.data.id] Credit memo id to post. Required
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostCreditMemo(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postReceivable";
            obj.feather = "CreditMemo";
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postCreditMemo", doPostCreditMemo);

}(datasource));