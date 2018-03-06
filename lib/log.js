'use strict';
var chalk; try { chalk = require('chalk'); } catch (e) {}
var moment; try { moment = require('moment'); } catch (e) {}

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  silly: 4,
};

function getCurrentTime () {
  var dt = moment ? moment().format('YYYY-MM-DD HH:mm:ss.SSS') : Date.now();
  return chalk ? chalk.grey(dt) : dt;
}

function matchLevel(got, expected) {
  return got && logLevels(got) >= logLevels(expected);
}

exports.createLogger = function(options) {
  options = options || {};
  const log = exports.log;

  return {
    info: (options.debug || matchLevel(options.logLevel, 'info')) && log,
    error: log,
    debug: (options.debug || matchLevel(options.logLevel, 'debug')) && log,
    silly: matchLevel(options.logLevel, 'silly') && log
  };
}

exports.log = function () {
  process.stdout.write(getCurrentTime() + '  ');
  console.log.apply(console, arguments);
};

