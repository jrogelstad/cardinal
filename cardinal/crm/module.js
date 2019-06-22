/*
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
*/
const catalog = f.catalog();

/**
    Lead model
*/
function lead(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Lead");
    let model = f.createModel(data, feather);

    function followUpIcon() {
        if (model.data.followUp()) {
            return "flag";
        }

        return "";
    }

    model.addCalculated({
        name: "followUpIcon",
        description: "Flagged for follow up",
        type: "string",
        format: "icon",
        style: "HIGH",
        function: followUpIcon
    });

    return model;
}

lead.static = f.prop({
    flagFollowUp: function (viewModel) {
        "use strict";

        viewModel.selections().forEach(
            function (model) {
                model.data.followUp(true);
                model.save();
            }
        );
    },
    flagFollowUpCheck: function (selections) {
        "use strict";

        return selections.some((model) => !model.data.followUp());
    },
    unflagFollowUp: function (viewModel) {
        "use strict";

        viewModel.selections().forEach(
            function (model) {
                model.data.followUp(false);
                model.save();
            }
        );
    },
    unflagFollowUpCheck: function (selections) {
        "use strict";

        return selections.some((model) => model.data.followUp());
    }
});

lead.calculated = f.prop({
    followUpIcon: {
        type: "string",
        description: "Flagged for follow up",
        format: "icon"
    }
});

catalog.registerModel("Lead", lead);