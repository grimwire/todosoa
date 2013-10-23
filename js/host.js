/*global $$, $ */
(function (window) {
	'use strict';

	/**
	 * Takes a model server and view server and acts as the Host between them
	 *
	 * @constructor
	 * @param {string} storageUrl URL to the storage server
	 * @param {string} viewUrl URL to the view server
	 */
	function Host(storageUrl, viewUrl) {
		// Call the local.Server constructor
		local.Server.call(this);

		// Generate agents which point toward the Storage server and View items
		var viewApi = local.agent(viewUrl);
		this.storageApi = local.agent(storageUrl);
		this.listItemView = viewApi.follow({ rel: 'item', id: 'listitem' });
		this.counterView  = viewApi.follow({ rel: 'item', id: 'counter' });
		this.clearBtnView = viewApi.follow({ rel: 'item', id: 'clearbtn' });

		this.ENTER_KEY = 13;
		this.ESCAPE_KEY = 27;

		this.$main = $$('#main');
		this.$toggleAll = $$('#toggle-all');
		this.$todoList = $$('#todo-list');
		this.$todoItemCounter = $$('#todo-count');
		this.$clearCompleted = $$('#clear-completed');
		this.$footer = $$('#footer');

		window.addEventListener('load', function () {
			this._updateFilterState();
		}.bind(this));

		window.addEventListener('hashchange', function () {
			this._updateFilterState();
		}.bind(this));
	}

	// Inherit from the local.Server prototype
	Host.prototype = Object.create(local.Server.prototype);

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
	Host.prototype.handleLocalRequest = function(req, res) {
		var self = this;
		/*
		Toplevel Resource
		*/
		if (req.path == '/') {
			// Set the link header
			res.setHeader('link', [
				{ href: '/', rel: 'self service collection', title: 'TodoSOA App Host' },
				{ href: '/active', rel: 'item', id: 'active' },
				{ href: '/completed', rel: 'item', id: 'completed' },
				{ href: '/{id}', rel: 'item' },
			]);

			// Route by method
			switch (req.method) {
				case 'HEAD':
					// Send back the link header
					res.writeHead(204, 'ok, no content').end();
					break;

				case 'POST':
					// Create a new item and add it to the UI
					req.on('end', function() {
						// Add to storage
						self.storageApi.post(req.body).then(function () {
							// Redraw
							self._filter(true);
							res.writeHead(204, 'ok, no content').end();
						});
					});
					break;

				default:
					res.writeHead(405, 'bad method').end();
			}
		} else {
			// Extract the ID
			var id = req.path.slice(1);

			// Set the link header
			res.setHeader('link', [
				{ href: '/', rel: 'up service collection', title: 'TodoSOA App Host' },
				{ href: '/'+id, rel: 'self item', id: id }
			]);

			// Route by method
			switch (req.method) {
				case 'HEAD':
					// Send back the link header
					res.writeHead(204, 'ok, no content').end();
					break;

				case 'SHOW':
					// Only applies to the following IDs:
					if (id != 'all' && id != 'active' && id != 'completed') {
						// Desired resource does not support SHOW
						return res.writeHead(405, 'bad method').end();
					}

					// Fetch the items from storage, filtered down to the set implied by our ID
					var query = {};
					if (id == 'active') { query.completed = 0; }
					else if (id == 'completed') { query.completed = 1; }
					this.storageApi.dispatch({ method: 'GET', query: query })
						.then(function(res2) {
							var items = res2.body;
							/*
							Send render GET requests for each item

							ABOUT
							Whenever multiple requests need to be coordinated, you can add them to an array and call one of the
							bundling functions. The resulting promise will be a fulfilled or rejected with an array containing
							all of the responses.
							- `local.promise.bundle()`: always fulfills the resulting promise, regardless of whether each promise
							   succeeds or fails.
							- `local.promise.all()`: only fulfills the resulting promise if all of the contained promises succeed.
							- `local.promise.any()`: fulfills the resulting promise if any of the contained promises succeed.
							*/
							var responses_ = [];
							items.forEach(function(item) {
								var query = { item_id: item.id, title: item.title, completed: item.completed };
								responses_.push(self.listItemView.dispatch({ method: 'GET', query: query }));
							});
							// Bundle the responses into one promise that will fulfill when all promises fulfill or reject
							return local.promise.bundle(responses_);
						})
						.then(function(res3s) {
							// Render the HTML to the page
							self.$todoList.innerHTML = res3s.map(function(res3) { return res3.body; }).join('');
							res.writeHead(204, 'ok, no content').end();
						});
					break;

				case 'EDIT':
					// Trigger edit-mode for the given item
					this.editItem(id);
					res.writeHead(204, 'ok, no content').end();
					break;

				case 'CHECK':
				case 'UNCHECK':
					// Toggle the completed state of the given item

					// Fetch the item(s) we're un/checking
					var checked = (req.method == 'CHECK');
					var navQuery = (id == 'completed' || id == 'active') ? { rel: 'self', completed: (id == 'completed') ? 1 : 0 } : { rel: 'item', id: id };
					this.storageApi.follow(navQuery).get()
						.then(function(res2) {
							// Iterate item(s)
							var responses_ = [];
							var items = Array.isArray(res2.body) ? res2.body : [res2.body];
							items.forEach(function (item) {
								// Update UI
								var listItem = $$('[data-id="' + item.id + '"]');
								if (!listItem) { return; }
								listItem.className = (checked) ? 'completed' : '';
								listItem.querySelector('input').checked = checked;

								// Update storage
								responses_.push(self.storageApi.follow({ rel: 'item', id: item.id }).put({ completed: checked }));
							});

							// Wait till all items are handled
							return local.promise.bundle(responses_);
						})
						.then(function() {
							// Update UI
							self._filter();
							res.writeHead(204, 'ok, no content').end();
						});
					break;

				case 'DELETE':
					// Delete the given item

					// Fetch the item(s) we're deleting
					var navQuery = (id == 'completed' || id == 'active') ? { rel: 'self', completed: (id == 'completed') ? 1 : 0 } : { rel: 'item', id: id };
					this.storageApi.follow(navQuery).get()
						.then(function(res2) {
							// Iterate item(s)
							var responses_ = [];
							var items = Array.isArray(res2.body) ? res2.body : [res2.body];
							items.forEach(function (item) {
								// Update UI
								var elem = $$('[data-id="' + item.id + '"]');
								if (elem) { self.$todoList.removeChild(elem); }

								// Update storage
								responses_.push(self.storageApi.follow({ rel: 'item', id: item.id }).delete());
							});

							// Wait till all items are handled
							return local.promise.bundle(responses_);
						})
						.then(function() {
							// Update UI
							self._filter();
							res.writeHead(204, 'ok, no content').end();
						});
					break;

				default:
					res.writeHead(405, 'bad method').end();
			}
		}
	};

	/**
	 * Hides the label text and creates an input to edit the title of the item.
	 * When you hit enter or blur out of the input it saves it and updates the UI
	 * with the new name.
	 *
	 * @param {number} id The id of the item to edit
	 * @param {object} label The label you want to edit the text of
	 */
	Host.prototype.editItem = function (id) {
		var li = $$('[data-id="' + id + '"]');
		var label = li.querySelector('label');

		var onSaveHandler = function () {
			var value = input.value.trim();
			var discarding = input.dataset.discard;

			if (value.length && !discarding) {
				// Update the item in storage
				this.storageApi.follow({ rel: 'item', id: id }).put({ title: input.value });

				// Instead of re-rendering the whole view just update
				// this piece of it
				label.innerHTML = value;
			} else if (value.length === 0) {
				// No value was entered in the input. We'll remove the todo item.
				this.removeItem(id);
			}

			// Remove the input since we no longer need it
			// Less DOM means faster rendering
			li.removeChild(input);

			// Remove the editing class
			li.className = li.className.replace('editing', '');
		}.bind(this);

		// Append the editing class
		li.className = li.className + ' editing';

		var input = document.createElement('input');
		input.className = 'edit';

		// Get the innerHTML of the label instead of requesting the data from the
		// ORM. If this were a real DB this would save a lot of time and would avoid
		// a spinner gif.
		input.value = label.innerHTML;

		li.appendChild(input);

		input.addEventListener('blur', onSaveHandler);

		input.addEventListener('keypress', function (e) {
			if (e.keyCode === this.ENTER_KEY) {
				// Remove the cursor from the input when you hit enter just like if it
				// were a real form
				input.blur();
			}

			if (e.keyCode === this.ESCAPE_KEY) {
				// Discard the changes
				input.dataset.discard = true;
				input.blur();
			}
		}.bind(this));

		input.focus();
	};

	/**
	 * Updates the pieces of the page which change depending on the remaining
	 * number of todos.
	 */
	Host.prototype._updateCount = function () {
		var counts, self = this;
		// Request a count from storage
		this.storageApi.dispatch({ method: 'COUNT' })
			.then(function(res) {
				counts = res.body;

				// Use the given counts to request renders
				return local.promise.bundle([
					self.counterView.dispatch({ method: 'GET', query: { active: counts.active }}),
					self.clearBtnView.dispatch({ method: 'GET', query: { completed: counts.completed }})
				]);
			})
			.then(function(ress) {
				// Update the UI
				self.$todoItemCounter.innerHTML = ress[0].body;
				self.$clearCompleted.innerHTML = ress[1].body;
				self.$clearCompleted.style.display = counts.completed > 0 ? 'block' : 'none';

				self.$toggleAll.checked = counts.completed === counts.total;

				self._toggleFrame(counts);
			});
	};

	/**
	 * The main body and footer elements should not be visible when there are no
	 * todos left.
	 *
	 * @param {object} todos Contains a count of all todos, and their statuses.
	 */
	Host.prototype._toggleFrame = function (todos) {
		var frameDisplay = this.$main.style.display;
		var frameVisible = frameDisplay === 'block' || frameDisplay === '';

		if (todos.total === 0 && frameVisible) {
			this.$main.style.display = 'none';
			this.$footer.style.display = 'none';
		}

		if (todos.total > 0 && !frameVisible) {
			this.$main.style.display = 'block';
			this.$footer.style.display = 'block';
		}
	};

	/**
	 * Re-filters the todo items, based on the active route.
	 * @param {boolean|undefined} force  forces a re-painting of todo items.
	 */
	Host.prototype._filter = function (force) {
		var activeRoute = this._activeRoute;

		// Update the elements on the page, which change with each completed todo
		this._updateCount();

		// If the last active route isn't "All", or we're switching routes, we
		// re-create the todo item elements, calling:
		//   this.show[All|Active|Completed]();
		if (force || this._lastActiveRoute !== 'all' || this._lastActiveRoute !== activeRoute) {
			// Send a SHOW request to ourself to render the intended set of items
			local.agent(this.getUrl())
				.follow({ rel: 'item', id: activeRoute })
				.dispatch({ method: 'SHOW' });
		}

		this._lastActiveRoute = activeRoute;
	};

	/**
	 * Simply updates the filter nav's selected states
	 */
	Host.prototype._updateFilterState = function () {
		var currentPage = this._getCurrentPage() || '';

		// Store a reference to the active route, allowing us to re-filter todo
		// items as they are marked complete or incomplete.
		this._activeRoute = currentPage;

		if (currentPage === '') {
			this._activeRoute = 'all';
		}

		this._filter();

		// Remove all other selected states. We loop through all of them in case the
		// UI gets in a funky state with two selected.
		$('#filters .selected').each(function (item) {
			item.className = '';
		});

		$$('#filters [href="#/' + currentPage + '"]').className = 'selected';
	};

	/**
	 * A getter for getting the current page
	 */
	Host.prototype._getCurrentPage = function () {
		return document.location.hash.split('/')[1];
	};

	// Export to window
	window.app.Host = Host;
})(window);
