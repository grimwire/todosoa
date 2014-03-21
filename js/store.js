/*jshint eqeqeq:false */
(function (window) {
	'use strict';

	// Local storage server
	function Store(name, callback) {
		// Call the local.Server constructor
		local.Server.call(this);
		var data;
		var dbName;

		callback = callback || function () {};
		dbName = this._dbName = name;
		if (!localStorage[dbName]) {
			data = { todos: [] };
			localStorage[dbName] = JSON.stringify(data);
		}
		callback.call(this, JSON.parse(localStorage[dbName]));
	}

	// Inherit from the local.Server prototype
	Store.prototype = Object.create(local.Server.prototype);

	// Generates a response to requests from within the application.
	Store.prototype.handleLocalRequest = function(req, res) {
		/*
		Toplevel Resource
		*/
		if (req.path == '/') {
			// Set headers
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
			// Extract the id from the request path.
			var id = req.path.slice(1);

			// Set headers
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

	// Finds items based on a query given as a JS object
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

	// Will retrieve all data from the collection
	Store.prototype.findAll = function (callback) {
		callback = callback || function () {};
		callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
	};

	// Will save the given data to the DB. If no item exists it will create a new
	// item, otherwise it'll simply update an existing item's properties
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

	// Will remove an item from the Store based on its ID
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

	// Will drop all storage and start fresh
	Store.prototype.drop = function (callback) {
		localStorage[this._dbName] = JSON.stringify({todos: []});
		callback.call(this, JSON.parse(localStorage[this._dbName]).todos);
	};

	// Export to window
	window.app.Store = Store;
})(window);
