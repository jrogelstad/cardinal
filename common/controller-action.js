/*global datasource*/
(function (datasource) {
  "strict";

  // Fetch nodes refereced by action distribution
  function getNodes (action) {
    var obj = this;

    return new Promise (function (resolve, reject) {
      var payload, ids;

      ids = action.distributions.map(function (dist) {
        return dist.node.id;
      });

      if (ids.length) {
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

        return;
      }

      resolve([]);
    });
  }

  // Update nodes whether used or not depending on
  // action history
  function updateNodes (nodes) {
    var obj = this;

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
            var payload2 = {
                method: "POST",
                name: "Node",
                id: node.id,
                client: obj.client,
                data: node
              };

            if (!resp.length) {
              node.isUsed = false;
            } else {
              node.isUsed = true;
            }

            datasource.request(payload2, true)
              .then(resolve)
              .catch(reject);
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

  function doAfterInsertAction (obj) {
    return new Promise (function (resolve, reject) {
      Promise.resolve()
        .then(getNodes.bind(obj, obj.data))
        .then(updateNodes.bind(obj))
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("POST", "Action",
    doAfterInsertAction, datasource.TRIGGER_AFTER);

  function doCacheAction (obj) {
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

  datasource.registerFunction("PATCH", "Action",
    doCacheAction, datasource.TRIGGER_BEFORE);
  datasource.registerFunction("DELETE", "Action",
    doCacheAction, datasource.TRIGGER_BEFORE);

  function doAfterUpdateAction (obj) {
    return new Promise (function (resolve, reject) {

      function processPatch () {
        return new Promise (function (resolve) {
          var filtered, idx,
            action = {distributions: []};

          filtered = obj.data.filter(function (item) {
            if (item.path.search("^/distributions") > -1) {
              return (item.op === "add") || (item.op === "replace" &&
                (item.value === undefined || item.path.search("node/id$") > -1));
            }

            return false;
          });

          filtered.forEach(function (item) {
            var dist =  {node: {}};

            // New distribution
            if (item.op === "add") {
              dist.node.id = item.value.node.id;
              action.distributions.push(dist);
            } else {

              // Distribution node changed
              if (item.op === "replace" && item.value) {
                // New node
                dist.node.id = item.value;
                action.distributions.push(dist);
              }

              // Old node (changed or deleted)
              idx = item.path.slice(15,16);
              dist = {node: {id: obj.cache.distributions[idx].node.id}};
              action.distributions.push(dist);
            }
          });

          resolve(action);
        });
      }

      Promise.resolve()
        .then(processPatch)
        .then(getNodes.bind(obj))
        .then(updateNodes.bind(obj))
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("PATCH", "Action",
    doAfterUpdateAction, datasource.TRIGGER_AFTER);


  function doAfterDeleteAction (obj) {
    return new Promise (function (resolve, reject) {
      var action = obj.cache;

      Promise.resolve()
        .then(getNodes.bind(obj, action))
        .then(updateNodes.bind(obj))
        .then(resolve)
        .catch(reject);
    });
  }

  datasource.registerFunction("DELETE", "Action",
    doAfterDeleteAction, datasource.TRIGGER_AFTER);

}(datasource));
