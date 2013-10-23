# Local.js TodoSOA Example

TodoSOA is based on the <a href="http://todomvc.com">TodoMVC example</a> for VanillaJS. It has the same functionality, but uses Local.js servers in the document and in Web Workers. The source has been annotated to help developers familiarize with Local.js.

You can find <a href="http://grimwire.com/local/#docs/todosoa.md">a high-level overview of the source at grimwire.com</a>.

---

## Notes on its design

TodoSOA is focused more on illustrating Local.js than making a good user experience. You should notice small latency in the rendering process which results in less smooth UI updates. This is due to at least two factors:

 1. Updates to the UI are made in stages - some before messages are fired, some after.
 2. Templates are rendered in a Web Worker, increasing the latency of the messages passed.

In real-world, you would want to keep rendering in the document thread and avoid partial UI updates by waiting until all new HTML is ready. However, it's good to remember that message passing will always introduce some latency to your application, and may not be the right tool in some situations.