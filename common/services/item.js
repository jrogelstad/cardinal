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
/*jslint es6*/
(function (datasource) {
    "strict";

    const f = require("./common/core");

    /**
      Item handler
    */
    function doHandleItem(obj) {
        return new Promise(function (resolve) {
            var found, oldSiteId, newSiteId,
                    newRec = obj.newRec,
                    oldRec = obj.oldRec;

            newRec.sites = Array.isArray(newRec.sites)
                ? newRec.sites
                : [];

            newRec.sites.forEach(function (row) {
                row.isPrimary = false;
            });

            if (oldRec && oldRec.site) {
                oldSiteId = oldRec.site.id;
            }

            if (newRec && newRec.site.id) {
                newSiteId = newRec.site.id;
            }

            if (!oldRec || oldSiteId !== newSiteId) {
                found = newRec.sites.find((row) => row.site.id === newRec.site.id);

                if (found) {
                    found.isPrimary = true;
                } else {
                    newRec.sites.push({
                        id: f.createId(),
                        site: {
                            id: newRec.site.id
                        },
                        isPrimary: true
                    });
                }
            }

            resolve();
        });
    }

    datasource.registerFunction("POST", "Item", doHandleItem,
            datasource.TRIGGER_BEFORE);

    datasource.registerFunction("PATCH", "Item", doHandleItem,
            datasource.TRIGGER_BEFORE);

}(datasource));