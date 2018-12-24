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
      Post a series of payables journals and update trial balance.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Object} [payload.data] Journal data
      @param {Array} [payload.data.ids] Journal ids to post. Default = all.
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostPayablesJournals(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postJournals";
            obj.feather = "PayablesJournal";
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postPayablesJournals", doPostPayablesJournals);

    /**
      Post a receivables journal and update trial balance.

      @param {Object} [payload] Payload.
      @param {Object} [payload.client] Database client.
      @param {Function} [payload.callback] callback.
      @param {Object} [payload.data] Journal data
      @param {Object} [payload.data.id] Journal id to post. Required
      @param {Object} [payload.data.date] Post date. Default today.
    */
    function doPostPayablesJournal(obj) {
        return new Promise(function (resolve, reject) {
            obj.name = "postJournal";
            obj.feather = "PayablesJournal";
            datasource.request(obj, true)
                .then(resolve)
                .catch(reject);
        });
    }

    datasource.registerFunction("POST", "postPayablesJournal", doPostPayablesJournal);

}(datasource));