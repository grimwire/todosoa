/*global $$, app */
(function () {
	'use strict';

	/**
	 * Set the dispatch wrapper.
	 *
	 * ABOUT
	 * The dispatch wrapper is a middleware between calls to local.dispatch() and the actual message being sent.
	 * It can be used for setting global policies such as:
	 *  - Logging
	 *  - Caching strategies
	 *  - Traffic rerouting
	 *  - Permissioning
	 *  - Formatting and sanitizing
	 * Make sure that all requests eventually receive a response, even if the request is not passed on to the given dispatch function.
	 */
	local.setDispatchWrapper(function(req, res, dispatch) {
		// Dispatch the request, wait for a response, then log both
		dispatch(req, res).always(console.log.bind(console, req));
	});

	/**
	 * Sets up a brand new Todo list.
	 *
	 * @param {string} name The name of your new to do list.
	 */
	function Todo(name) {
		/*
		Load the view server into a Web Worker.

		ABOUT
		local.spawnWorkerServer() first loads local.js into the worker from the given "bootstrapUrl". This is so
		sandboxing policies can take place (an experimental feature).

		The target script path should be given relative to the bootstrapUrl. When loaded, the worker is assigned
		an httpl:// address according to the script's filename. In this case, the worker will be given the url
		`httpl://view.js`.

		Note, any requests sent to httpl://view.js before it loads will be buffered and delivered when ready.
		*/
		local.spawnWorkerServer('view.js', { bootstrapUrl: 'js/local.js' });

		/*
		Load the storage and main app host into the document.

		ABOUT
		local.addServer() can take a function, or an object that descends from local.Server.prototype. In the
		latter case, a `config` object is added to the server with a `domain` attribute.
		*/
		local.addServer('storage', new app.Store(name));
		local.addServer('todo', new app.Host('httpl://storage', 'httpl://view.js'));

		/*
		Create an agent pointing toward the application host server.

		ABOUT
		`this.api` is a headless browser pointing to 'httpl://todo'. Any requests dispatched from it can ignore
		the `url` parameter. Using links in the response headers, `this.api` can find other URLs on the app host
		and spawn agents to them as well.
		*/
		this.api = local.agent('httpl://todo');
	}

	var todo = new Todo('todos-localjs');

	/**
	 * Finds the model ID of the clicked DOM element and spawns an agent pointing to its resource.
	 *
	 * @param {object} target The starting point in the DOM for it to try to find
	 * the ID of the model.
	 */
	function lookupResource(target) {
		while (target.nodeName !== 'LI') {
			target = target.parentNode;
		}
		/*
		Search links provided by 'httpl://todo' for the first which includes the 'item' value in the `rel` attribute,
		and which has the given value for the `id`.

		ABOUT
		Agent `follow()` calls spawn new agents with a reference to the parent agent. When the created agent makes
		a request, it will `resolve()` its query by searching the parent agent for a matching link. Once a URL is
		found, it is cached, and subsequent requests will go to that URL (until told to `unresolve()`).

		This makes it possible to chain `follow()` calls to describe multiple navigations, then trigger resolution
		as needed. If any parent agent fails to resolve, the error will propagate to the final child.
		*/
		return todo.api.follow({ rel: 'item', id: target.dataset.id });
	}

	// When the enter key is pressed fire the addItem method.
	$$('#new-todo').addEventListener('keypress', function (e) {
		var title = e.target.value.trim();
		if (e.keyCode === 13 && title !== '') {
			/*
			Send a POST to the app host to create a new item.

			Note, we're assuming success and discarding the response, since the app host updates the UI.
			*/
			todo.api.post({ title: title, completed: 0 });
			e.target.value = '';
		}
	});

	// A delegation event. Will check what item was clicked whenever you click on any
	// part of a list item.
	$$('#todo-list').addEventListener('click', function (e) {
		// If you click a destroy button
		if (e.target.className.indexOf('destroy') > -1) {
			// Find the matching resource and send a DELETE request
			lookupResource(e.target).delete();
		}

		// If you click the checkmark
		if (e.target.className.indexOf('toggle') > -1) {
			// Find the matching resource and send a CHECK/UNCHECK request
			lookupResource(e.target).dispatch({ method: (e.target.checked) ? 'CHECK' : 'UNCHECK' });
		}
	});

	$$('#todo-list').addEventListener('dblclick', function (e) {
		if (e.target.nodeName === 'LABEL') {
			// Find the matching resource and send an EDIT request
			lookupResource(e.target).dispatch({ method: 'EDIT' });
		}
	});

	$$('#toggle-all').addEventListener('click', function (e) {
		// Send a CHECK or UNCHECK request to httpl://todo/active or httpl://todo/completed
		var id = (e.target.checked) ? 'active' : 'completed';
		var method = (e.target.checked) ? 'CHECK' : 'UNCHECK';
		todo.api.follow({ rel: 'item', id: id }).dispatch({ method: method });
	});

	$$('#clear-completed').addEventListener('click', function () {
		// Send a DELETE request to httpl://todo/completed
		todo.api.follow({ rel: 'item', id: 'completed' }).dispatch({ method: 'DELETE' });
	});
})();
