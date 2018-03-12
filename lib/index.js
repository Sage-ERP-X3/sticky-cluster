'use strict';
const os = require('os');
const cluster = require('cluster');

const helpers = require('./helpers');
const hash = helpers.hash;

var logger = {};


function createStickyCookie(name, value, secure) {
  const parts = [value, 'Path=/', 'HttpOnly'];
  if (secure) parts.push('Secure');
  return name + '=' + parts.join('; ');
}

exports.dispatch = function(requestListener, _secure) {

  return function(request, response) {
    const sticky = request.connection.__sticky__;
    const value = sticky.value + '/' + sticky.id;
    const secure = _secure || request.connection.encryped;
    let cookie;
    let cookies = response.getHeader('set-cookie');
    if (cookies) {
      if (!cookies.some(c => c.indexOf(sticky.name + '=' + value + ';'))) {
        cookie = createStickyCookie(sticky.name, value, secure);
        cookies.push(cookie);
        response.setHeader('set-cookie', cookies);
      }
    } else {
      cookie = createStickyCookie(sticky.name, value, secure);
      response.setHeader('set-cookie', [cookie]);
    }
    cookies = response.getHeader('set-cookie');
    logger.debug && logger.debug('[WORKER] #' + cluster.worker.id + '  sticky proxy dispatch:', request.url, 'sticky-cookie:', cookie);

    requestListener(request, response);
  };
};

exports.start = function(startFn, _options) {
  var options = (function() {
    var options = _options || {};
    return {
      prefix: options.prefix || 'sticky-cluster:',
      concurrency: options.concurrency || require('os').cpus().length,
      port: options.port || 8080,
      host: options.host,
      clusterId: options.clusterId,
      ssl: options.ssl,
      stickyHeader: options.stickyHeader,
      stickyCookie: options.stickyCookie,
      debug: options.debug || false,
      hardShutdownDelay: options.hardShutdownDelay || 60 * 1000,
      env: options.env || function(index) {
        return {
          stickycluster_worker_index: index
        };
      },
      exitHandler: options.exitHandler || process.exit,
      errorHandler: options.errorHandler || function(err) {
        console.log(err);
        this.exitHandler(1);
      },
      on: options.on,
      logger: options.logger || require('./log').createLogger(options)
    };
  })(_options);

  exports.logger = logger = options.logger;

  if (cluster.isMaster) {
    options.clusterId = options.clusterId || (hash(os.hostname()).toString(16) + hash(options.port).toString(16));
    if (options.stickyCookie) {
      options.stickyCookie.prefix = options.stickyCookie.prefix || '__sticky_';
      options.stickyCookie.name = options.stickyCookie.prefix + options.clusterId;
    }
  }

  var workers = require('./workers')(options);
  var master = require('./master')(workers, options);

  if (cluster.isMaster) master.start();
  else if (cluster.isWorker) startFn(workers.serve);
};
