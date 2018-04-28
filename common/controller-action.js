/*global datasource*/
(function (datasource) {
  "strict";

  function getNodes (action) {
    var that = this;
    return new Promise (function (resolve, reject) {
      var payload, ids;

      ids = action.distributions.map(function (dist) {
        return dist.node.id;
      });

      payload = {
        method: "GET",
        name: "Node",
        client: that.client,
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

  function doAfterInsertAction (obj) {
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

      Promise.resolve()
        .then(getNodes.bind(obj, obj.data))
        .then(updateNodes)
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("POST", "Action",
    doAfterInsertAction, datasource.TRIGGER_AFTER);

  function doBeforeDeleteAction (obj) {
    return new Promise (function (resolve, reject) {
      function getAction () {
        return new Promise (function (resolve, reject) {
          var payload = {
            method: "GET",
            name: "Action",
            id: obj.id,
            client: obj.client
          };

          datasource.request(payload, true)
            .then(resolve)
            .catch(reject);
        });
      }

      function cacheAction (action) {
        return new Promise (function (resolve) {
          obj.cache = action;
          resolve();
        });
      }

      Promise.resolve()
        .then(getAction)
        .then(cacheAction)
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("DELETE", "Action",
    doBeforeDeleteAction, datasource.TRIGGER_BEFORE);

  function doAfterDeleteAction (obj) {
    return new Promise (function (resolve, reject) {
      var action = obj.cache;

      function updateNodes (nodes) {
        return new Promise (function (resolve, reject) {
          var requests = nodes.map(function (node) {
            var payload = {
                method: "GET",
                name: "Distribution",
                properties: ["id"],
                client: obj.client,
                filter: {
                  criteria: [{
                    property: "node.id",
                    operator: "=",
                    value: node.id
                  }],
                  limit: 1
                }
              };

            function callback (resp) {
              return new Promise (function (resolve, reject) {
                var payload2;

                if (!resp.length) {
                  node.isUsed = false;
                  payload2 = {
                    method: "POST",
                    name: "Node",
                    id: node.id,
                    client: obj.client,
                    data: node
                  };

                  datasource.request(payload2, true)
                    .then(resolve)
                    .catch(reject);
                  return;
                }

                resolve();
              });        
            }

            return datasource.request(payload, true)
              .then(callback);
          });

          Promise.all(requests)
            .then(resolve)
            .catch(reject);
        });
      }

      Promise.resolve()
        .then(getNodes.bind(obj, action))
        .then(updateNodes)
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("DELETE", "Action",
    doAfterDeleteAction, datasource.TRIGGER_AFTER);

}(datasource));
