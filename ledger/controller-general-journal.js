/*global datasource*/
(function (datasource) {
  "strict";

  var doInsertGeneralJournal = function (obj) {
    var afterCheckJournal,
      client = obj.client,
      callback = obj.callback;

    delete obj.client;
    delete obj.callback;

    afterCheckJournal = function (err) {
      if (err) {
        callback(err);
        return;
      }

      // Create journal
      datasource.request({
        method: "POST",
        name: "doInsert",
        client: client,
        callback: callback,
        data: {
          name: "GeneralJournal",
          data: obj
        }
      }, true);
    };

    // Validate
    datasource.request({
      method: "POST",
      name: "checkJournal",
      client: client,
      callback: afterCheckJournal,
      data: {
        journal: obj
      }
    }, true);
  };

  datasource.registerFunction("POST", "GeneralJournal", doInsertGeneralJournal);

}(datasource));
