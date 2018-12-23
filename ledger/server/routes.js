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
/*global app, datasource*/
/*jslint es6, node*/
(function (app, datasource) {
    "strict";

    const express = require("express");

    // Register route to the public
    var doRequest = datasource.postFunction,
        router = express.Router();

    router.route("/post/general-journal").post(doRequest.bind("postGeneralJournal"));
    router.route("/post/general-journals").post(doRequest.bind("postGeneralJournals"));
    router.route("/close-fiscal-period").post(doRequest.bind("closeFiscalPeriod"));
    router.route("/open-fiscal-period").post(doRequest.bind("openFiscalPeriod"));

    app.use('/ledger', router);

}(app, datasource));
