'use strict';
const crypto = require('crypto');
const hash = require('string-hash');

exports.uuid = function(extra) {
  return crypto.randomBytes(16).toString('hex') + (extra ? hash(extra).toString(16) : '');
};

exports.parseCookies = function (request) {
  var cookies = {},
    rc = request && request.headers && request.headers.cookie;

  rc && rc.split(';').forEach(function(cookie) {
    var parts = cookie.split('=');
    cookies[parts.shift().trim()] = decodeURI(parts.join('='));
  });

  return cookies;
};

exports.hash = hash;