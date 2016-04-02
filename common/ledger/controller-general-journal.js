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

  var doDeleteGeneralJournal = function (obj) {
    var afterJournal;

    afterJournal = function (err, resp) {
      try {
        if (err) { throw err; }
        if (resp.isPosted) {
          throw "Can not delete a posted journal.";
        }

        // Delete journal
        datasource.request({
          method: "POST",
          name: "doDelete",
          client: obj.client,
          callback: obj.callback,
          data: {
            name: "GeneralJournal",
            id: obj.id
          }
        }, true);
      } catch (e) {
        obj.callback(e);
      }
    };

    // Validate
    datasource.request({
      method: "GET",
      name: "GeneralJournal",
      id: obj.id,
      client: obj.client,
      callback: afterJournal
    }, true);
  };

  datasource.registerFunction("DELETE", "GeneralJournal", doDeleteGeneralJournal);

}(datasource));
