/*
 * job handles:
 *	running the given plugin with pluginname
 *	archive results
 *	store/load
 *
 */


const rand = require('./rand');
const fs = require('fs');
const Log = require('./Log')('Job');
const config = require("./config");
const Schedule = require('./schedule');
const JOBIDLEN = 24;
const exec = require('./exec');
const extend = require('./extend');
const rimraf = require('rimraf');
const promise_io = require('./promise_io');
const Mail = require('./mail');
const path = require('path');
const userconfig = require('./userconfig');

require('./runtime');

const E_BAD = "BAD";

function lsdir(dir) {
	return fs.readdirSync(dir);
}


function cleandir(dir, olderthanhours) {
	fs.readdir(dir, function(err, files) {
		files.forEach(function(file) {
			fs.stat(path.join(dir, file), function(err, stat) {
				var endTime, now;
				if (err) {
					return console.error(err);
				}
				now = new Date().getTime();
				endTime = new Date(stat.ctime).getTime() + ( olderthanhours * 3600000) ;
				if (now > endTime) {
					return rimraf(path.join(dir, file), function(err) {
						if (err) {
							return console.error(err);
						}
					});
				}
			});
		});
	});
}


class Job{
	clean(){
		Log.silly('performing clean on:', this.getHistoryPath());
		var usercfg = userconfig.get();
		cleandir(this.getHistoryPath(), usercfg.logkeep || 1 );
	}

	resetLastResult() {
		this.$lastresult = "__WAITING__";
	}

	constructor(){
		Log.silly("create Job object");
		this.$lastresult = "__WAITING__";
	}

	loadPlugin() {
		var pp = config.plugindir + '/' + this.pluginname;
		Log.silly("load plugin:", pp);
		this.$plugin = require(pp);
	}

	loadSched() {
		this.$sched = new Schedule();
		this.$sched.set(this.sched);
	}

	/*create a new one*/
	create(opts){
		Log.silly("create new Job");
		extend(this,opts);

		this.jobID = rand(JOBIDLEN);
		this.active=true;
		this.loadSched();
		this.save();
	}

	compile(cmdtemplate, args){
		Log.silly("compile");
		var cpy = cmdtemplate;
		for (var tn in args) {
			cpy = cpy.replace('{'+tn+'}', args[tn]);
		}
		return cpy;
	}

	compileCommand(){
		this.loadPlugin();
		var compiled = this.compile(this.$plugin.command, this.args);
		return compiled;
	}

	getJobIdentifier() {
		return this.name + ' ' + this.pluginname + ' '+ this.getjobID();
	}

	getjobID() {
		return this.jobID;
	}

	composeMail(ident, headline, result){
		var msg = `
		<html>
			<h3>`+headline+` `+ident+`</h3>

			Result:
			<pre>`+result+`</pre>
		</html>
		`;
		return msg;
	}

	async notifyBad(result){
		Log.silly("mailing bad status");
		var ident = this.getJobIdentifier();
		await Mail(config.systemname + " [BAD]: " + ident, this.composeMail(ident, "Job Gone Bad", result));
	}

	async goneBad(result){
		if (!this.$bad) {
			this.$bad = true;
			await this.notifyBad(result);
		} else {
			Log.silly("bad already mailed");
		}

		return E_BAD;
	}

	async goneGood(result) {
		if(this.$bad) {
			this.$bad =false;
			var ident = this.getJobIdentifier();
			await Mail(config.systemname + " [GOOD]: " + ident, this.composeMail(ident, "Job Gone Good", result));
		}
	}

	async run(){
		if(!this.active) {
			Log.silly("inactive", this.getjobID());
			return;
		}

		if(!this.$sched.check()) {
			return;
		}

		var cmd = this.compileCommand();
		Log.silly("run:", cmd);
		var result = '';
		try {
			result = await exec(cmd);
		} catch (e) {
			Log.error('failed on executing', e);
			result = await this.goneBad(result);
		}
		var _result = result;

		Log.silly("["+cmd+"] result:", result.substring(0, 40));
		if (!result) result = await this.goneBad(_result);

		try {
			if (this.$plugin.parse) {
				result = this.$plugin.parse(result, this.args);
			}

			if (this.$plugin.bad) {
				if(this.$plugin.bad(result, this.args)) {
					Log.error("plugin returned bad status");
					result = await this.goneBad(_result);
				}
			}
		} catch (e) {
			Log.error('Failed in plugin functions', e);
			result = await this.goneBad(_result);
		}

		if (result != E_BAD) await this.goneGood(result);

		this.$lastresult = result;
		this.archiveResult(result);
	}

	getFileName(){
		return config.jobsdir + "/" + this.jobID + ".json";
	}

	getHistoryPath(){
		var d = config.jobsdir + "/" + this.jobID;
		try {
			fs.mkdirSync(d);
		} catch (e) {
			//Log.error("failed to mkdir", e);
		}
		return d;
	}

	//load and instantiate from disk
	load(jobID){
		this.jobID = jobID;
		Log.silly("load", jobID );
		var srcfile = this.getFileName();
		var self = this;

		return new Promise( (resolve,reject) => {
			fs.readFile( srcfile, (err, data) => {
				if(err) {
					Log.error("failed to load:", err, srcfile);
					reject(err);
				} else {
					var d = data.toString();
					Log.silly("reconstruct from:", d);
					self.fromJsonString(d);
					resolve(data);
				}

			});
		});
	}

	reload() {
		this.load(this.getjobID());
	}

	//parse and set the values from str
	fromJsonString(str){
		var jso = JSON.parse(str);
		for(var f in jso) this[f] = jso[f];
		this.loadSched();
	}

	//store current state to disk
	async save(){
		var self = this;
		return new Promise( (resolve,reject) => {
			var dstfile = self.getFileName();
			var data = self.toJsonString(); //JSON.stringify(this);
			fs.writeFile(dstfile, data, function (err) {
				if(err) {
					Log.error("failed to load:", err, dstfile);
					reject(err);
				} else {
					resolve();
				}
			});
		});

	}
	//store to history disk
	archiveResult(result){
		var dst = this.getHistoryPath();
		var cd = new Date();

		this.clean();
		fs.writeFile(dst+"/"+cd.getTime()+".out", result, function () {
			Log.silly("wrote file");
		} );
	}

	toJson() {
		var cpy = JSON.parse(JSON.stringify(this));
		for( var f in cpy ) {
			if(f.match(/^\$/)) delete cpy[f];
		}
		return cpy;
	}

	toJsonString(){
		var cpy = this.toJson();
		return JSON.stringify(cpy);
	}

	getLastResult(){
		return this.$lastresult || 'none';
	}

	//get the history n times back
	async getHistory(){
		var histp = this.getHistoryPath();
		var files = lsdir(histp);
		var ret = [];
		for(var i = 0 ; i < files.length ; i++)
		{
			var o = {
				time : files[i],
				data : await promise_io.promiseFileRead(histp + "/" + files[i])
			};
			ret.push(o);
		}
		return ret;
	}

	//delete everthing of the job
	remove(){
		rimraf(this.getHistoryPath(), function () { Log.silly('deleted all history'); });
		fs.unlinkSync(this.getFileName());
		this.active=false;
	}
}

module.exports = Job;