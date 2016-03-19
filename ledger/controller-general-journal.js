/*global datasource*/
(function (datasource) {
  "strict";

  var doInsertGeneralJournal = function (obj) {
    var afterCheckJournal,
      client = obj.client,
      callback = obj.callback,
      journal = obj.data;

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
          data: journal
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
        journal: journal
      }
    }, true);
  };

  datasource.registerFunction("POST", "GeneralJournal", doInsertGeneralJournal);

}(datasource));
