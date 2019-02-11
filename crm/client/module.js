const catalog = f.catalog();
const model = catalog.store().factories().model;

/**
    Lead model
*/
function lead(data, feather) {
    "use strict";

    feather = feather || catalog.getFeather("Lead");
    let that = model(data, feather);

    function followUpIcon() {
        if (that.data.followUp()) {
            return "flag";
        }

        return "";
    }

    that.addCalculated({
        name: "followUpIcon",
        description: "Flagged for follow up",
        type: "string",
        format: "icon",
        style: "HIGH",
        function: followUpIcon
    });

    return that;
}

lead.static = f.prop({
    flagFollowUp: function (viewModel) {
        "use strict";

        viewModel.tableWidget().selections().forEach(
            function (model) {
                debugger
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

        viewModel.tableWidget().selections().forEach(
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
        format: "icon"
    }
});

catalog.registerModel("Lead", lead, true);