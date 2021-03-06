/*
 * Copyright 2018 Björn Geschka <bjoern@geschka.org>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
define([
	"app",
], function(app) {
	app.service("config", function($rootScope, api) {
		this.triggercount = 20;
		this.cfg = {
			config : {
				polltimeout : 1500,
				viewmode : "list"
			}
		};

		function triggerflag(flag,_cfg) {
			var trig = flag+'_trigger';
			_cfg[trig] = _cfg[trig] || 0;
			_cfg[trig] += 1;
			if (_cfg[trig] > triggercount) {
				console.log("config flagged:", flag);
				_cfg[flag]=true;
			}
		}

                $rootScope.$on('keydown', function (msg,obj) {
			switch (obj.code) {
				case 46://delete
					triggerflag('debug', cfg);
					break;
				default:
					//console.log("keydown",obj.code);
					break;
			}
                });

		api.call({
			method:"getconfig"
		}).then( function (res) {
			this.cfg.config = res.config;
		});

		this.save = function (frm) {
			api.call({
				method:"setconfig",
				config : this.cfg.config
			}).then( function (res) {
				if(frm) frm.$setPristine();
				this.cfg.config = res.config;
			});
		};


		window.cfg = this.cfg;
		return this;
	});
});
