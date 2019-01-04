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
/*jslint browser*/
/*global f, require*/

/**
  Post a series of journals and update trial balance.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Object} [payload.data] Journal data
  @param {Array} [payload.data.ids] Journal ids to post. Default = all.
  @param {Object} [payload.data.date] Post date. Default today.
*/
function doPostGeneralJournals(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        obj.name = "postJournals";
        obj.feather = "GeneralJournal";
        f.datasource.request(obj, true).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "postGeneralJournals",
    f.doPostGeneralJournals
);

/**
  Post a general journal and update trial balance.

  @param {Object} [payload] Payload.
  @param {Object} [payload.client] Database client.
  @param {Function} [payload.callback] callback.
  @param {Object} [payload.data] Journal data
  @param {Object} [payload.data.id] Journal id to post. Required
  @param {Object} [payload.data.date] Post date. Default today.
*/
function doPostGeneralJournal(obj) {
    "use strict";

    return new Promise(function (resolve, reject) {
        obj.name = "postJournal";
        obj.feather = "GeneralJournal";
        f.datasource.request(obj, true).then(resolve).catch(reject);
    });
}

f.datasource.registerFunction(
    "POST",
    "postGeneralJournal",
    f.doPostGeneralJournal
);
