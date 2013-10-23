importScripts('local.js');

var listItemTemplate
=	'<li data-id="{{item_id}}" class="{{completed}}">'
+		'<div class="view">'
+			'<input class="toggle" type="checkbox" {{checked}}>'
+			'<label>{{title}}</label>'
+			'<button class="destroy"></button>'
+		'</div>'
+	'</li>';

/*
Set a server for the worker.

ABOUT
Any request sent to the worker from the page will arrive here for fulfillment.

SharedWorkers can have multiple pages. Therefore, a third parameter (`page`) is passed with a PageConnection object
representing the origin of the request. If a worker is not shared, it can ignore the parameter.
*/
local.worker.setServer(function (req, res, page) {
	/*
	This server provides a set of templates which are rendered with GET requests. If an application wanted to implement
	caching, it could add the appropriate headers to the response and store renders in the dispatch wrapper.
	*/

	// Only accept HEAD and GET requests
	if (req.method != 'HEAD' && req.method != 'GET') {
		return res.writeHead(405, 'bad method').end();
	}

	// Route by path
	switch (req.path) {
		case '/':
			// Toplevel resource, respond with the link header
			res.setHeader('link', [
				{ href: '/', rel: 'self collection service', title: 'TodoSOA HTML Generator' },
				{ href: '/listitem{?item_id,title,completed}', rel: 'item', id: 'listitem' },
				{ href: '/counter{?active}', rel: 'item', id: 'counter' },
				{ href: '/clearbtn{?completed}', rel: 'item', id: 'clearbtn' }
			]);
			res.writeHead(204, 'ok, no content').end();
			break;

		case '/listitem':
			// Creates an <li> HTML string and returns it for placement in your app
			res.setHeader('link', [
				{ href: '/', rel: 'up collection service', title: 'TodoSOA HTML Generator' },
				{ href: '/listitem{?item_id,title,completed}', rel: 'self item', id: 'listitem' }
			]);

			if (req.method == 'HEAD') {
				return res.writeHead(204, 'ok, no content').end();
			}

			template = listItemTemplate
				.replace('{{item_id}}', req.query.item_id)
				.replace('{{title}}', req.query.title)
				.replace('{{completed}}', (req.query.completed) ? 'completed' : '')
				.replace('{{checked}}', (req.query.completed) ? 'checked' : '');

			res.writeHead(200, 'ok', { 'content-type': 'text/html' }).end(template);
			break;

		case '/counter':
			// Displays a counter of how many to dos are left to complete
			res.setHeader('link', [
				{ href: '/', rel: 'up collection service', title: 'TodoSOA HTML Generator' },
				{ href: '/counter{?active}', rel: 'self item', id: 'counter' }
			]);
			if (req.method == 'HEAD') {
				return res.writeHead(204, 'ok, no content').end();
			}
			var plural = req.query.active === 1 ? '' : 's';
			res.writeHead(200, 'ok', { 'content-type': 'text/html' });
			res.end('<strong>' + req.query.active + '</strong> item' + plural + ' left');
			break;

		case '/clearbtn':
			// Updates the text within the "Clear completed" button
			res.setHeader('link', [
				{ href: '/', rel: 'up collection service', title: 'TodoSOA HTML Generator' },
				{ href: '/clearbtn{?completed}', rel: 'self item', id: 'clearbtn' }
			]);
			if (req.method == 'HEAD') {
				return res.writeHead(204, 'ok, no content').end();
			}
			res.writeHead(200, 'ok', { 'content-type': 'text/html' });
			res.end((req.query.completed > 0) ? 'Clear completed (' + req.query.completed + ')' : '');
			break;

		default:
			res.writeHead(404, 'not found').end();
	}
});
