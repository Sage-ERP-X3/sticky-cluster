'use strict';
const common = require('_http_common');
const parsers = common.parsers;
const HTTPParser = process.binding('http_parser').HTTPParser;
const helpers = require('./helpers');
const uuid = helpers.uuid;
const parseCookies = helpers.parseCookies;
const hash = helpers.hash;

// Adds cookie stickiness. Thanks to https://github.com/awolden for his work on https://github.com/indutny/sticky-session/pull/45

module.exports = function(workers, options) {
  const logger = options.logger;
  const CONCURRENCY = options.concurrency;
  const PORT = options.port;
  const HARD_SHUTDOWN_DELAY = options.hardShutdownDelay;
  const errorHandler = options.errorHandler;
  const connections = {};
  var serverInstance;

  function ipHashBalancer(connection) {
    // manage connections map
    const signature = connection.remoteAddress + ':' + connection.remotePort;
    logger.debug && logger.debug('[MASTER]  ip hash balancer receive connection from ' + signature, 'ssl:', connection.encryped);

    connections[signature] = connection;
    connection.on('close', function() {
      delete connections[signature];
    });

    // choose a worker
    const h = hash(connection.remoteAddress || '');
    const index = h % CONCURRENCY;
    workers.entrust(index, connection, {
      sticky: { name:'#ip_hash',value: h }
    });
  }

  function stickyHeaderBalancer(connection) {

    const signature = connection.remoteAddress + ':' + connection.remotePort;
    logger.debug && logger.debug('[MASTER]  sticky header balancer receive connection from ' + signature, 'ssl:', connection.encryped);

    connections[signature] = connection;
    connection.on('close', function() {
      delete connections[signature];
    });

    connection.resume();
    connection.once('data', function(buffer) {
      const parser = parsers.alloc();
      parser.reinitialize(HTTPParser.REQUEST);
      parser.onIncoming = function(req, res) {

        let address = connection.remoteAddress || '';
        //default to remoteAddress, but check for existence of stickyHeader
        logger.debug && logger.debug('[MASTER]  sticky header balancer request:', req.url);
        logger.silly && logger.silly('[MASTER]  sticky header balancer headers:', req.headers);
        if (options.stickyHeader && req.headers[options.stickyHeader]) {
          logger.silly && logger.silly('[MASTER]  sticky header balancer match header ' + options.stickyHeader + ': ' + req.headers[options.stickyHeader]);
          address = req.headers[options.stickyHeader];
        }
        logger.debug && logger.debug('[MASTER]  sticky header balancer from', address);
        var h = hash(address);
        var index = h % CONCURRENCY;
        logger.silly && logger.silly('[MASTER]  sticky header balancer buffer:\n' + buffer.toString());
        workers.entrust(index, connection, {
          buffer: buffer,
          sticky: { name: options.stickyHeader ,value: h }
        });
      };
      logger.silly && logger.silly('[MASTER]  sticky header parser execute\n' + buffer.toString());
      var parsed = parser.execute(buffer, 0, buffer.length);
      logger.silly && logger.silly('[MASTER]  sticky header parser parsed', parsed);
      parser.finish();
      logger.silly && logger.silly('[MASTER]  sticky header parser finish');
    });
  }

  function stickyCookieBalancer(connection) {

    var signature = connection.remoteAddress + ':' + connection.remotePort;
    logger.debug && logger.debug('[MASTER]  sticky cookie balancer receive connection from ' + signature, 'ssl:', connection.encryped);
    connection.resume();

    connections[signature] = connection;
    connection.on('close', function() {
      delete connections[signature];
    });
    connection.once('data', function(buffer) {

      logger.debug && logger.debug('[MASTER]  sticky cookie balancer buffer:\n' + buffer.toString());
      var parser = parsers.alloc();
      parser.reinitialize(HTTPParser.REQUEST);
      parser.onIncoming = function(req) {

        logger.debug && logger.debug('[MASTER]  sticky cookie balancer request:', req.url);
        logger.silly && logger.silly('[MASTER]  sticky cookie balancer headers:', req.headers);
        logger.silly && logger.silly('[MASTER]  sticky cookie balancer cookie name:', options.stickyCookie && options.stickyCookie.name);

        const name = options.stickyCookie && options.stickyCookie.name;
        let address = name && parseCookies(req)[name];
        if (address) {
          logger.debug && logger.debug('[MASTER]  sticky cookie balancer find', address);
          address = address.split('/')[0];
        } else {
          address = uuid(signature);
          logger.debug && logger.debug('[MASTER]  sticky cookie balancer new', address);
        }
        var index = hash(address) % CONCURRENCY;
        workers.entrust(index, connection, {
          buffer: buffer,
          sticky: { name: name, value: address }
        });
      };
      parser.execute(buffer, 0, buffer.length);
      parser.finish();
    });
  }

  function serverCreate() {
    return require('net')
      .createServer({
        pauseOnConnect: true
      }, options.stickyCookie ? stickyCookieBalancer : (options.stickyHeader ? stickyHeaderBalancer : ipHashBalancer));
  }

  function serverStart(callback) {
    serverInstance = serverCreate().on('error', errorHandler);
    serverInstance.listen({
      port: PORT,
      host: options.host
    }, callback);
  }

  function serverStop(callback) {

    // stop listening for new connections
    serverInstance.close(function(err) {
      if (err) console.log(err);
      else return callback();
    });

    // destroy active connections
    logger.debug && logger.debug('[MASTER]  destroy active connections...');
    Object.keys(connections).forEach(function(signature) {
      logger.debug && logger.debug('[MASTER]  destroy', signature);
      connections[signature].destroy();
    });
  }

  function stop() {

    // stop gracefully
    logger.debug && logger.debug('[MASTER]  stop...');
    serverStop(function() {

      // stop workers
      logger.debug && logger.debug('[WORKERS]  stop...');
      workers.stop();

      //
      logger.debug && logger.debug('[MASTER]  ...stopped');
    });

    // stop forced
    setTimeout(
      function() {

        // stop workers
        logger.debug && logger.debug('[WORKERS]  stop...');
        workers.stop();

        // kill master
        logger.debug && logger.debug('[MASTER]  killed');
        options.exitHandler(1);
      },
      HARD_SHUTDOWN_DELAY
    ).unref();
  }

  function start() {
    logger.debug && logger.debug('[MASTER]  start...', options.clusterId);
    serverStart(function() {
      if (logger.debug) {
        logger.debug('[MASTER]  ...started at port %d, pid=%d', PORT, process.pid);
        logger.debug('[WORKERS]  start...');
      }
      options.on && options.on('masterStart', {server:serverInstance, port:PORT});
      workers.start();
      process.once('SIGINT', function() {
        logger.debug('receive SIGINT', PORT, process.pid);
        stop();
      });
    });
  }

  return {
    start: start,
    stop: stop
  };
};
