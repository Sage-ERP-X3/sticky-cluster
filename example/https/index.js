"use strict";
const cluster = require('cluster');
const http = require('http');
const fs = require('fs');
const sticky = require('../../lib');

sticky.start(
	// server initialization function
	function(callback) {
		const logger = sticky.logger;
		const server = http.createServer(sticky.dispatch(function(req, res) {
		// const server = http.createServer(function(req, res) {
			logger.debug && logger.debug('[WORKER] #' + cluster.worker.id + '  dispatch: ', req.url);
			logger.silly && logger.silly('[WORKER] #' + cluster.worker.id + '  actual server: ', process.pid, req.connection ? req.connection.__sticky__ : '<no connection>');
			res.writeHead(200);
			res.end('process ' + process.pid + ' says hello!');
		// });
		}));
    // const emit = server.emit;
    // server.emit = function(event, data) {
    //     logger.debug && logger.debug('[WORKER] #%d  emit', cluster.worker.id, event);
    //     emit.call(server, event, data);
    // }

		callback(server);
	},
	// options
	{
		concurrency: 4,
		port: 3000,
		// host: 'localhost',
		// ssl: {
		// 	key: fs.readFileSync(__dirname + '/ssl/server.key'),
		// 	cert: fs.readFileSync(__dirname + '/ssl/server.crt'),
		// 	ca: fs.readFileSync(__dirname + '/ssl/ca.crt'),
		// 	passphrase: "sage",			
		// },
		debug: true,
		// stickyHeader: 'x-sem-sticky',
		stickyCookie: {},
		// stickyCookie: {
		// 	// prefix: '__sem_sticky_'
		// },
		env: function(index) {
			return {
				stickycluster_worker_index: index
			};
		},
		exitHandler: function(exitcode){
			logger.debug && logger.debug('Exiting #' + cluster.worker.id);
			process.exit(exitcode);
		},
		on: function(event, data) {
			// return;
			const logger = sticky.logger;
			if (event === 'masterStart') {
				const server = data.server;
				const port = data.port;
				// logger.debug && logger.debug('on pid:', process.pid, event, data.server.address(), data.port);
				logger.debug && logger.debug('[MASTER]  on', event, 'pid:' + process.pid, data.server.address(), data.port);
				var httpProxy = require('http-proxy');
				httpProxy.createServer({
				  target: {
				    host: 'localhost',
				    port: port
				  },
					ssl: {
						key: fs.readFileSync(__dirname + '/ssl/server.key'),
						cert: fs.readFileSync(__dirname + '/ssl/server.crt'),
						ca: fs.readFileSync(__dirname + '/ssl/ca.crt'),
						passphrase: "sage",			
					},
				}).listen(443);							
			}
		}
	}
);
