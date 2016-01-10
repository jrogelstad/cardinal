/*global f */
(function () {
  "strict";

  var relations = [
      {
        feather: "Role",
        valueProperty: "name",
        labelProperty: "description",
        form: "dbflv6oz3d10",
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
        form: "syva8q1zh98d",
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
