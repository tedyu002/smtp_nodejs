var util = require('util');
var events = require('events');
var config = require('./config.js');
var constant = require('./constant.js');

var crlf_buf = new Buffer(2);
crlf_buf[0] = constant.CR;
crlf_buf[1] = constant.LF;

module.exports = {
	instance : function(connection, event_name) {
		var bufs = [];
		var total_length = 0;
		var emitter = new events.EventEmitter();

		return {
			emitter: emitter,
			read: function(chunk) {
				var new_buf;
				var processed = false;

				if (bufs.length !== 0) {
					var buf = bufs[bufs.length - 1];
					if (buf[buf.length -1] === constant.CR && chunk[0] === constant.LF) {
						bufs.push(crlf_buf.slice(1));
						var tmp_buf = chunk.slice(1);
						if (tmp_buf.length > 0) {
							new_buf = tmp_buf;
						}
						processed = true;
					}
				}

				if (processed === false) {
					var index = chunk.indexOf(crlf_buf);
					if (index === -1) {
						bufs.push(chunk);
						total_length += chunk.length;
						if (total_length > config.buf_size) {
							/* TODO Buf Overflow Error handling */
						}
					}
					else {
						bufs.push(chunk.slice(0, index + crlf_buf.length));

						var tmp_buf = chunk.slice(index + crlf_buf.length);
						if (tmp_buf.length > 0) {
							new_buf = tmp_buf;
						}

						processed = true;
					}
				}

				if (processed === true) {
					var cmd_buf = Buffer.concat(bufs);

					bufs = new_buf ? [new_buf] : [];
					total_length = new_buf ? new_buf.length : 0;

					for (var i = 0; i < cmd_buf; ++i) {
						if (cmd_buf[i] >= 128) {
							/* TODO invalid charset Error handling */
						}
					}

					var str = cmd_buf.toString('ascii');
					cmd_buf = null;

					connection.pause();
					emitter.emit(event_name, str);
				}
			},
			read_next: function() {
				if (bufs.length == 0) {
					connection.resume();	
				}
				else if (bufs.length > 1) {
					/* TODO Error Handling */
				}
				else {
					var index = bufs[0].indexOf(crlf_buf);
					if (index === -1) {
						connection.resume();
					}
					else {
						var cmd_buf = bufs[0].slice(0, index + crlf_buf.length);
						var tmp_buf = bufs[0].slice(index + crlf_buf.length);

						bufs = tmp_buf.length > 0 ? [tmp_buf] : [];

						var str = cmd_buf.toString('ascii');
						cmd_buf = null;
						
						emitter.emit(event_name, str);
					}
				}
			}
		};
	}
};
