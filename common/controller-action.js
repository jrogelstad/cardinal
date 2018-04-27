/*global datasource*/
(function (datasource) {
  "strict";

  var doAfterInsertAction = function (obj) {
    return new Promise (function (resolve, reject) {
      function updateNodes (nodes) {
        return new Promise (function (resolve, reject) {
          var requests = nodes.map(function (node) {
            var payload = {
                method: "POST",
                id: node.id,
                name: "Node",
                client: obj.client,
                data: node
              };

            node.isUsed = true;

            return datasource.request(payload, true);
          });

          Promise.all(requests)
            .then(resolve)
            .catch(reject);
        });
      }

      function getNodes () {
        return new Promise (function (resolve, reject) {
          var payload, ids;

          ids = obj.data.distributions.map(function (dist) {
            return dist.node.id;
          });

          payload = {
            method: "GET",
            name: "Node",
            client: obj.client,
            filter: {
              criteria: [{
                property: "id",
                operator: "IN",
                value: ids
              }]
            }
          };

          datasource.request(payload, true)
            .then(resolve)
            .catch(reject);
        });
      }

      Promise.resolve()
        .then(getNodes)
        .then(updateNodes)
        .then(resolve)
        .catch(reject);
    });
  };

  datasource.registerFunction("POST", "Action",
    doAfterInsertAction, datasource.TRIGGER_AFTER);

}(datasource));
