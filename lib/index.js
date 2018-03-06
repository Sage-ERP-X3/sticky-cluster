'use strict';
const os = require('os');
const cluster = require('cluster');

const uuid = require('./helpers').uuid;
var logger = {};

function createStickyCookie(name, value, secure) {
  const parts = [value, 'Path=/', 'HttpOnly'];
  if (secure) parts.push('Secure');
  return name + '=' + parts.join('; ');
}

exports.dispatch = function(requestListener) {

  return function(request, response) {
    const sticky = request.connection.__sticky__;
    const value = sticky.value + '/' + sticky.id;
    let cookie;
    let cookies = response.getHeader('set-cookie');
    // logger.debug && logger.debug('WORKER #' + cluster.worker.id + '  proxy before cookies', stickyValue, cookies);
    if (cookies) {
      if (!cookies.some(c => c.indexOf(sticky.name + '=' + value + ';'))) {
        cookie = createStickyCookie(sticky.name, value, 'authorized' in request.connection);
        cookies.push(cookie);
        response.setHeader('set-cookie', cookies);
      }
    } else {
      cookie = createStickyCookie(sticky.name, value);
      response.setHeader('set-cookie', [cookie]);
    }
    cookies = response.getHeader('set-cookie');
    logger.debug && logger.debug('WORKER #' + cluster.worker.id + '  dispatch proxy, cookies:', cookies);

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
      stickyHeader: options.stickyHeader,
      stickyCookie: options.stickyCookie,
      debug: options.debug || false,
      hardShutdownDelay: options.hardShutdownDelay || 60 * 1000,
      env: options.env || function(index) {
        return {
          stickycluster_worker_index: index
        };
      },
      errorHandler: options.errorHandler || function(err) {
        console.log(err);
        process.exit(1);
      },
      logger: options.logger || require('./log').createLogger(options)
    };
  })(_options);

  exports.logger = logger = options.logger;

  if (options.stickyCookie) {
    if (cluster.isMaster) {
      options.clusterId = uuid(os.hostname() + ':' + options.port);
      options.stickyCookie.prefix = options.stickyCookie.prefix || '__sticky_';
      options.stickyCookie.name = options.stickyCookie.prefix + options.clusterId;
    }
  }

  var workers = require('./workers')(options);
  var master = require('./master')(workers, options);

  if (cluster.isMaster) master.start();
  else if (cluster.isWorker) startFn(workers.serve);
};
