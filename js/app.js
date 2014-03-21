/*global $$, app */
(function () {
	'use strict';

	// App Setup
	// =========

	local.setDispatchWrapper(function(req, res, dispatch) {
		// Log all requests
		dispatch(req, res).always(console.log.bind(console, req));
	});

	// Spawn servers
	local.spawnWorkerServer('js/view.js', { domain: 'view.js' });
	local.addServer('storage', new app.Store('todos-localjs'));
	local.addServer('todo', new app.Todo('httpl://storage', 'httpl://view.js'));

	var todoApi = local.agent('httpl://todo');
	// Finds the model ID of the clicked DOM element and spawns an agent pointing to its resource.
	function lookupResource(target) {
		while (target.nodeName !== 'LI') {
			target = target.parentNode;
		}
		return todoApi.follow({ rel: 'item', id: target.dataset.id });
	}


	// Event Handlers
	// ==============

	// When the enter key is pressed fire the addItem method.
	$$('#new-todo').addEventListener('keypress', function (e) {
		var title = e.target.value.trim();
		if (e.keyCode === 13 && title !== '') {
			// Create a new item
			todoApi.POST({ title: title, completed: 0 });
			e.target.value = '';
		}
	});

	// Click list buttons
	$$('#todo-list').addEventListener('click', function (e) {
		// If you click a destroy button
		if (e.target.className.indexOf('destroy') > -1) {
			lookupResource(e.target).DELETE();
		}

		// If you click the checkmark
		if (e.target.className.indexOf('toggle') > -1) {
			lookupResource(e.target).dispatch({ method: (e.target.checked) ? 'CHECK' : 'UNCHECK' });
		}
	});

	// Double-click list item
	$$('#todo-list').addEventListener('dblclick', function (e) {
		if (e.target.nodeName === 'LABEL') {
			lookupResource(e.target).dispatch({ method: 'EDIT' });
		}
	});

	// Click "toggle all" button
	$$('#toggle-all').addEventListener('click', function (e) {
		// Send a CHECK or UNCHECK request to httpl://todo/active or httpl://todo/completed
		var id = (e.target.checked) ? 'active' : 'completed';
		var method = (e.target.checked) ? 'CHECK' : 'UNCHECK';
		todoApi.follow({ rel: 'item', id: id }).dispatch({ method: method });
	});

	// Click "clear completed" button
	$$('#clear-completed').addEventListener('click', function () {
		todoApi.follow({ rel: 'item', id: 'completed' }).DELETE();
	});
})();
