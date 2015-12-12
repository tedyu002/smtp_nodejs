var util = require('util');
var events = require('events');
var config = require('./config.js');
var constant = require('./constant.js');

var crlf_buf = new Buffer(2);
crlf_buf[0] = constant.CR;
crlf_buf[1] = constant.LF;

var dotcrlf_buf = new Buffer(3);
dotcrlf_buf[0] = constant.PERIOD;
dotcrlf_buf[1] = constant.CR;
dotcrlf_buf[2] = constant.LF;

var DM_DIS = 0;
var DM_ENTER = 1;
var DM_INTER = 2;

module.exports = {
	instance : function(connection, event_name, data_event, data_end_event) {
		var bufs = [];
		var total_length = 0;
		var emitter = new events.EventEmitter();
		var data_mode = DM_DIS;

		var post_process = function (cmd_buf) {
			for (var i = 0; i < cmd_buf; ++i) {
				if (cmd_buf[i] >= 128) {
					/* TODO invalid charset Error handling */
				}
			}

			if (data_mode === DM_DIS) {
				var str = cmd_buf.slice(0, cmd_buf.length - 2).toString('ascii');

				connection.pause();
				emitter.emit(event_name, str);
			}
			else {
				if (cmd_buf[0] == constant.PERIOD && cmd_buf.length > dotcrlf_buf.length) {
					cmd_buf = cmd_buf.slice(1);
				}

				connection.pause();
				if (cmd_buf.length == dotcrlf_buf.length &&
					cmd_buf.equals(dotcrlf_buf)) {
					emitter.emit(data_end_event);
				}
				else {
					data_mode = DM_INTER;
					emitter.emit(data_event, cmd_buf);
				}
			}
		};

		return {
			emitter: emitter,
			disable_data_mode: function() {
				data_mode = DM_DIS;
			},
			enter_data_mode: function() {
				data_mode = DM_ENTER;
			},
			inter_data_mode: function() {
				data_mode = DM_INTER;
			},
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

					post_process(cmd_buf);
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

						post_process(cmd_buf);
					}
				}
			}
		};
	}
};
