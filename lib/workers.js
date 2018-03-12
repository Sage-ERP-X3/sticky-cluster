'use strict';
var cluster = require('cluster');

module.exports = function(options) {
  var logger = options.logger;
  var CONCURRENCY = options.concurrency;
  var PREFIX = options.prefix;
  var ENV = options.env;
  var ids = [];
  var running;

  function create(index) {

    // create
    var env = ENV(index);
    var worker = cluster.fork(env);
    ids[index] = worker.id;

    // revive dead
    worker.on('exit', function(code, signal) {
      logger.debug && logger.debug('[WORKER] #' + worker.id +'  ...stopped', worker.process.pid);
      if (running) create(index);
    });

    logger.debug && logger.debug('[WORKER] #%d  ...started, pid=%d', worker.id, worker.process.pid);
  }

  function serve(server) {
    var worker = cluster.worker;
    var id = worker.id;

    // listen for master's commands
    process.on('message', function(message, connection) {
      // ignore every message except master's
      if (connection && message.length && message[0] === PREFIX + 'connection') {

        // log
        logger.debug && logger.debug('[WORKER] #%d  connection from %s', id, connection.remoteAddress, JSON.stringify(message[1] && message[1].sticky));

        if (options.ssl) {
          const tls = require('tls');
          connection = new tls.TLSSocket(connection, {
            isServer: true,
            server: server,
            requestCert: options.requestCert,
            secureContext: tls.createSecureContext(options.ssl),
          });
        }

        // with got a buffer, so reappend it
        if (message[1]) {
          if (message[1].buffer) {
            const buf = Buffer.from(message[1].buffer, 'base64');
            logger.debug && logger.debug('[WORKER] #%d  reappend data from %s', id, connection.remoteAddress, buf.toString());
            message[1].buffer && connection.unshift(Buffer.from(message[1].buffer, 'base64'));
          }
          connection.__sticky__ = message[1].sticky;
        }
        if (options.ssl) {
          logger.debug && logger.debug('[WORKER] #%d  upgrade to ssl %s', id, connection.remoteAddress, connection.__sticky__, connection.encryped);
        }

        // emulate a connection event on the server by emitting the
        // event with the connection master sent to us
        server.emit('connection', connection);

        // resume as we already catched the conn
        if (!message[1]) {
          connection.resume();
        }
      }
    });

    // start local server
    server.listen(0 /* start on random port */ , 'localhost' /* accept connection from this host only */ );
  }

  function entrust(index, connection, options) {
    var id = ids[index];
    logger.debug && logger.debug('[MASTER]  connection %s goes to worker #%d', connection.remoteAddress, id);
    if (options.buffer) options.buffer = options.buffer.toString('base64');
    if (options.sticky) options.sticky.id = id;
    cluster.workers[id].send([PREFIX + 'connection', options], connection);
  }

  function kill(index) {
    var id = ids[index];
    logger.debug && logger.debug('[WORKER] #%d  stop...', id);
    cluster.workers[id].process.kill( /* if no argument is given, 'SIGTERM' is sent */ );
  }

  function createAll() {
    var i = CONCURRENCY;
    while (--i >= 0) create(i);
  }

  function killAll() {
    var i = CONCURRENCY;
    while (--i >= 0) kill(i);
  }

  function start() {
    running = true;
    createAll();
  }

  function stop() {
    if (running) {
      running = false;
      killAll();
    }
  }

  return {
    start: start,
    serve: serve,
    entrust: entrust,
    stop: stop
  };
};
