'use strict';

var container;

function displayUpdater() {
	document.getElementById('update').style.display = 'block';
}

function hideUpdater() {
	document.getElementById('update').style.display = 'none';
}

function constructRule(action, listName, data) {
	var rule = { recordType: 'Rules' };
	var fieldsValue = {
		ActionType: { value: data.action.type },
		TriggerFilter: { value: data.trigger['url-filter'] },
		List: { value: { recordName: listName, action: 'DELETE_SELF' }}
	};

	if (data.action.selector != null) {
		fieldsValue.ActionSelector = { value: data.action.selector };
	}

	if (data.trigger['url-filter-is-case-sensitive'] === true) {
			fieldsValue.TriggerFilterCaseSensitive = { value: 1 };
	}

	if (data.trigger['if-domain'] != null) {
		console.log('If domain: ' + data.trigger['if-domain']);
		fieldsValue.TriggerIfDomain = { value: data.trigger['if-domain'] };
	}

	if (data.trigger['unless-domain'] != null) {
		console.log('Unless domain: ' + data.trigger['unless-domain']);
		fieldsValue.TriggerUnlessDomain = { value: data.trigger['unless-domain'] };
	}

	if (data.trigger['load-type'] != null) {
		fieldsValue.TriggerLoadType = { value: data.trigger['load-type'] };
	}

	if (data.trigger['resource-type'] != null) {
		fieldsValue.TriggerResourceType = { value: data.trigger['resource-type'] };
	}

	if (action === 'create') {
		rule.fields = fieldsValue;
	} else if (action === 'delete') {
		rule.filterBy = fieldsValue;
	}

	console.log(rule);
	return rule;
}

function getRule(listName, data, callback) {
	var query = constructRule('delete', listName, data);
	container.publicCloudDatabase.performQuery(query).then(function(response) {
        if(response.hasErrors) {
          document.getElementById('log').innerText += response.errors[0] + '\n';
        } else {
			var records = response.records;
			if (records.length !== 1) {
				document.getElementById('log').innerText += records.length + ' records found for ' + 'data' + '\n';
			} else {
				callback(records[0].recordName);
			}
		}
	});
}

function commit(operations, operationNumber) {
	operations[operationNumber].commit().then(function(response) {
		if(response.hasErrors) {
			document.getElementById('log').innerText += 'Error for operation ' + operationNumber + '\n';
			document.getElementById('log').innerText += response.errors[0];
		} else {
			if (operationNumber === (operations.length - 1)) {
				document.getElementById('log').innerText += 'Successful upload to CloudKit';
			} else {
				commit(operations, operationNumber + 1);
			}
		}
	});
}

var maxOperationsPerBatch = 190;
function update(updates, operations, operationType, currentList, currentUpdate) {
	if (operationType === 'delete') {
		getRule(updates.lists[currentList], updates[updates.lists[currentList]].deleted[currentUpdate], function(name) { // We're getting the record's name of the rule to delete.
			console.log('On a la règle avec nom ' + name);
			if (currentUpdate % maxOperationsPerBatch === 0) { // No more than 190 rules per records' batch.
				console.log('On créer le batch');
				operations.push(container.publicCloudDatabase.newRecordsBatch());
			}
			operations[Math.floor(currentUpdate / maxOperationsPerBatch)].delete({ recordName: name }); // Adding the rule to delete to the bach, it's a really simple record with just the record's name.
			currentUpdate++;
			if (currentUpdate < updates[updates.lists[currentList]].deleted.length) { // Still rules to delete
				update(updates, operations, 'delete', currentList, currentUpdate);
			} else {
				if (modifications.created !== undefined) { // There is rules to add, let's do it.
					update(updates, operations, 'create', currentList, currentUpdate);
				} else if (currentList < (updates.lists.length - 1)) { // There is other lists.
					if (updates[updates.lists[currentList + 1]].deleted !== undefined) {
						update(updates, operations, 'delete', (currentList + 1), currentUpdate);
					} else {
						update(updates, operations, 'create', (currentList + 1), currentUpdate);
					}
				} else {
					commit(operations, 0);
				}
			}
		});
	} else if (operationType === 'create') {
		var modifications = updates[updates.lists[currentList]]; // We're getting the current list because adding rules is synchrnous so we'll do everything at once.
		var modif;
		for (modif in modifications.created) { // For each rule.
			if (currentUpdate % maxOperationsPerBatch === 0) { // No more than 190 rules per records' batch.
				operations.push(container.publicCloudDatabase.newRecordsBatch());
			}
			operations[Math.floor(currentUpdate / maxOperationsPerBatch)].create(constructRule('create', updates.lists[currentList], modifications.created[modif])); // Adding the rule to the batch.
			currentUpdate++;
		}

		if (currentList < (updates.lists.length - 1)) { // There is other lists.
			if (updates.lists[currentList + 1].deleted !== undefined) { // In the next list we need to add rules.
				update(updates, operations, 'delete', (currentList + 1), currentUpdate);
			} else { // We need to remove rules in the next list.
				update(updates, operations, 'create', (currentList + 1), currentUpdate);
			}
		} else {
			commit(operations, 0); // No more rules, we commit.
		}
	}
}

function getUpdates() {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
		if (xmlHttp.readyState === 4 && (xmlHttp.status === 200 || xmlHttp.status === 0)) {
			var updates = JSON.parse(xmlHttp.responseText);
			document.getElementById('log').innerText = updates.log;
			console.log(updates.list);
			if (updates.lists !== undefined) {
				if (updates[updates.lists[0]].deleted !== undefined) {
					update(updates, [], 'delete', 0, 0);
				} else {
					update(updates, [], 'create', 0, 0);
				}
			}
		}
	};
    xmlHttp.open( 'GET', '/update', true );
    xmlHttp.send( null );
}

function init(configuration) {
	var config = JSON.parse(configuration);

	CloudKit.configure({
      containers: [{

        // Change this to a container identifier you own.
        containerIdentifier: config.containerIdentifier,

        // And generate an API token through CloudKit Dashboard.
        apiToken: config.apiToken,

        environment: config.environment
      }]
    });
    container = CloudKit.getDefaultContainer();
    container.setUpAuth();
    container.whenUserSignsIn().then(function(userInfo) {
		if(userInfo) {
			displayUpdater();
		} else {
			hideUpdater();
		}
    });
    container.whenUserSignsOut().then(hideUpdater);
    document.getElementById('update').onclick = getUpdates;
}

window.addEventListener('cloudkitloaded', function() {
	var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
		if (xmlHttp.readyState === 4 && (xmlHttp.status === 200 || xmlHttp.status === 0)) {
			init(xmlHttp.responseText);
		}
	};
    xmlHttp.open( 'GET', '/cloudkit', true );
    xmlHttp.send( null );
});