/*jshint eqeqeq:false */
(function (window) {
	'use strict';

	/**
	 * Creates a new client side storage object and will create an empty
	 * collection if no collection already exists.
	 *
	 * @param {string} name The name of our DB we want to use
	 * @param {function} callback Our fake DB uses callbacks because in
	 * real life you probably would be making AJAX calls
	 */
	function Store(name, callback) {
		// Call the local.Server constructor
		local.Server.call(this);
		var data;
		var dbName;

		callback = callback || function () {};

		dbName = this._dbName = name;

		if (!localStorage[dbName]) {
			data = {
				todos: []
			};

			localStorage[dbName] = JSON.stringify(data);
		}

		callback.call(this, JSON.parse(localStorage[dbName]));
	}

	// Inherit from the local.Server prototype
	Store.prototype = Object.create(local.Server.prototype);

	/**
	 * Generates a response to requests from within the application.
	 *
	 * @param {local.Request} req The request stream
	 * @param {local.Response} req The response stream
	 *
	 * ABOUT
	 * Requests sent by `local.dispatch()` to this server's address will arrive here along with a response object.
	 * Request bodies may be streamed, so this function is called before the request finishes.
	 */
	Store.prototype.handleLocalRequest = function(req, res) {
		/*
		Toplevel Resource
		*/
		if (req.path == '/') {
			/*
			Set the link header

			ABOUT
			The link header has de/serialization functions registered in `local.httpHeaders`, allowing you to set the
			header in object or string format. When serialized, the header will look like this:

			Link: </{?completed}>; rel="self service collection"; title="TodoSOA Storage", </{id}>; rel="item"

			Local supports the URI Template spec in the `href` value of links, allowing servers to specify parameters
			rather than precise values. If a `local.Agent` queries with { rel: 'item', id: 'listitem' }, the `id` will
			match the token and fill in the value. Link headers are order-significant, so it's common to put links with
			specific values at top, then put the URI Templated links beneath.

			Note that Local will automatically prepend the domain to the URLs provided in links if they are given as
			relative paths.
			*/
			res.setHeader('link', [
				{ href: '/{?completed}', rel: 'self service collection', title: 'TodoSOA Storage' },
				{ href: '/{id}', rel: 'item' }
			]);

			// Route by method
			switch (req.method) {
				case 'HEAD':
					// Send back the link header
					res.writeHead(204, 'ok, no content').end();
					break;

				case 'GET':
					// Fetch all items. Can be filtered with ?query=[1|0]
					this.findAll(function(data) {
						if (typeof req.query.completed != 'undefined') {
							data = data.filter(function(item) {
								return item.completed == req.query.completed;
							});
						}
						res.writeHead(200, 'ok', {'content-type': 'application/json'}).end(data);
					});
					break;

				case 'COUNT':
					// Count all items
					var counts = {
						active: 0,
						completed: 0,
						total: 0
					};

					this.findAll(function (data) {
						data.each(function (todo) {
							if (todo.completed) {
								counts.completed++;
							} else {
								counts.active++;
							}

							counts.total++;
						});
					});

					res.writeHead(200, 'ok', {'content-type': 'application/json'}).end(counts);
					break;

				case 'POST':
					// Add a new item

					/*
					Wait until the stream has finished.

					ABOUT
					Requests are send to servers before their content has been delivered. If you want to handle each
					chunk as it arrives, you can subscribe to the 'data' event.

					The Request object automatically buffers the streamed content and deserializes it when the stream finishes.
					The parsing is handled by `local.contentTypes`, which selects the parser according to the Content-Type header.
					*/
					req.on('end', (function() {
						this.save(req.body, function(newTodo) {
							res.writeHead(201, 'created', { location: '/'+newTodo.id }).end();
						});
					}).bind(this));
					break;

				case 'DELETE':
					// Delete all items
					this.drop();
					res.writeHead(204, 'ok, no content').end();
					break;

				default:
					res.writeHead(405, 'bad method').end();
					break;
			}
		}
		/*
		Item Resource
		*/
		else {
			/*
			Extract the id from the request path.

			ABOUT
			The req.path parameter will always start with a '/', even if nothing follows the slash.
			*/
			var id = req.path.slice(1);

			// Set the link header
			res.setHeader('link', [
				{ href: '/{?completed}', rel: 'up service collection', title: 'TodoSOA Storage' },
				{ href: '/'+id, rel: 'self item', id: id }
			]);

			// Route by method
			switch (req.method) {
				case 'HEAD':
					// Send back the link header
					res.writeHead(204, 'ok, no content').end();
					break;

				case 'GET':
					// Get the content of the item
					this.find({ id: id }, function(data) {
						if (data[0]) {
							res.writeHead(200, 'ok', {'content-type': 'application/json'}).end(data[0]);
						} else {
							res.writeHead(404, 'not found').end();
						}
					});
					break;

				case 'PUT':
					// Update the item
					req.on('end', (function() {
						this.save(id, req.body, function() {
							res.writeHead(204, 'ok, no content').end();
						});
					}).bind(this));
					break;

				case 'DELETE':
					// Delete the item
					this.remove(id, function() {
						res.writeHead(204, 'ok, no content').end();
					});
					break;

				default:
					res.writeHead(405, 'bad method').end();
					break;
			}
		}
	};

	/**
	 * Finds items based on a query given as a JS object
	 *
	 * @param {object} query The query to match against (i.e. {foo: 'bar'})
	 * @param {function} callback	 The callback to fire when the query has
	 * completed running
	 *
	 * @example
	 * db.find({foo: 'bar', hello: 'world'}, function (data) {
	 *	 // data will return any items that have foo: bar and
	 *	 // hello: world in their properties
	 * });
	 */
	Store.prototype.find = function (query, callback) {
		if (!callback) {
			return;
		}

		var todos = JSON.parse(localStorage[this._dbName]).todos;

		callback.call(this, todos.filter(function (todo) {
			var match = true;
			for (var q in query) {
				if (query[q] != todo[q]) {
					match = false;
				}
			}
			return match;
		}));
	};

	/**
	 * Will retrieve all data from the collection
	 *
	 * @param {function} callback The callback to fire upon retrieving data
	 */
	Store.prototype.findAll = function (callback) {
		callback = callback || function () {};
		callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
	};

	/**
	 * Will save the given data to the DB. If no item exists it will create a new
	 * item, otherwise it'll simply update an existing item's properties
	 *
	 * @param {number} id An optional param to enter an ID of an item to update
	 * @param {object} data The data to save back into the DB
	 * @param {function} callback The callback to fire after saving
	 */
	Store.prototype.save = function (id, updateData, callback) {
		var data = JSON.parse(localStorage[this._dbName]);
		var todos = data.todos;

		callback = callback || function () {};

		// If an ID was actually given, find the item and update each property
		if (typeof id !== 'object') {
			for (var i = 0; i < todos.length; i++) {
				if (todos[i].id == id) {
					for (var x in updateData) {
						todos[i][x] = updateData[x];
					}
				}
			}

			localStorage[this._dbName] = JSON.stringify(data);
			callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
		} else {
			callback = updateData;

			updateData = id;

			// Generate an ID
			updateData.id = new Date().getTime();

			todos.push(updateData);
			localStorage[this._dbName] = JSON.stringify(data);
			callback.call(this, [updateData]);
		}
	};

	/**
	 * Will remove an item from the Store based on its ID
	 *
	 * @param {number} id The ID of the item you want to remove
	 * @param {function} callback The callback to fire after saving
	 */
	Store.prototype.remove = function (id, callback) {
		var data = JSON.parse(localStorage[this._dbName]);
		var todos = data.todos;

		for (var i = 0; i < todos.length; i++) {
			if (todos[i].id == id) {
				todos.splice(i, 1);
				break;
			}
		}

		localStorage[this._dbName] = JSON.stringify(data);
		callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
	};

	/**
	 * Will drop all storage and start fresh
	 *
	 * @param {function} callback The callback to fire after dropping the data
	 */
	Store.prototype.drop = function (callback) {
		localStorage[this._dbName] = JSON.stringify({todos: []});
		callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
	};

	// Export to window
	window.app.Store = Store;
})(window);
