/*global f */
(function () {
  "strict";

  var relations = [
      {
        feather: "Role",
        valueProperty: "name",
        labelProperty: "description",
        form: {
          name: "Role",
          attrs: [{
              attr: "name"
            }, {
              attr: "description"
            }, {
              attr: "createdBy"
            }, {
              attr: "updated"
            }, {
              attr: "updatedBy"
            }
          ]
        },
        list: {
          columns: [{
              attr: "name"
            }, {
              attr: "description"
            }, {
              attr: "createdBy"
            }, {
              attr: "updated"
            }, {
              attr: "updatedBy"
            }
          ]
        }
      }, {
        feather: "Opportunity",
        valueProperty: "number",
        labelProperty: "name",
        form: {
          name: "Opportunity",
          attrs: [{
              attr: "number"
            }, {
              attr: "name"
            }, {
              attr: "description"
            }, {
              attr: "createdBy"
            }, {
              attr: "updated"
            }, {
              attr: "updatedBy"
            }
          ]
        },
        list: {
          columns: [{
              attr: "number"
            }, {
              attr: "name"
            }, {
              attr: "description"
            }, {
              attr: "createdBy"
            }, {
              attr: "updated"
            }, {
              attr: "updatedBy"
            }
          ]
        }
      }
    ];

  relations.forEach(f.buildRelationWidget);

}());
