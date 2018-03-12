"use strict";
var cluster = require('cluster');
var http = require("http");
var sticky = require('../../lib');

sticky.start(
	// server initialization function
	function(callback) {
		const logger = sticky.logger;
		const server = http.createServer(sticky.dispatch(function(req, res) {
			logger.debug && logger.debug('[WORKER] #' + cluster.worker.id + "  dispatch: ", req.url);
			logger.silly && logger.silly('[WORKER] #' + cluster.worker.id + "  actual server: ", process.pid, req.connection ? req.connection.__sticky__ : "<no connection>");
			res.writeHead(200);
			res.end('process ' + process.pid + ' says hello!');
		}));
		callback(server);
	},
	// options
	{
		concurrency: 10,
		port: 3000,
		debug: true,
		// stickyHeader: 'x-sem-sticky',
		stickyCookie: {
			// prefix: '__sem_sticky_'
		},
		env: function(index) {
			return {
				stickycluster_worker_index: index
			};
		},
		exitHandler: function(exitcode){
			logger.debug && logger.debug('Exiting #' + cluster.worker.id)
			process.exit(exitcode);
		}
	}
);
