define([
	'app',
	'directives/labledrow/labledrow',
	'directives/cronsetting/cronsetting'
], function(app) {
	var name = "jobs";
	app.controller(name, function($scope, api,visuals,plugins,transports, session) {
		$scope.session=session;
		$scope.plugins = plugins;
		$scope.transports = transports;

		$scope.searchtext="";
		$scope.defaultjob = {
			$new: true,
			$edit: true,
			pluginname : 'ping',
			transportname : 'local',
			sched: '0 * * * * *',
			active: true
		};

		$scope.getDefaultJob = function() {
			return JSON.parse(JSON.stringify($scope.defaultjob));
		};

		$scope.jobs = [];
		api.call({
			method: 'listjobs'
		}).then(function(jobs) {
			jobs.forEach(function(job) {
				var a = [];

				for (var f in job.args) a.push(job.args[f]);

				job.$argsnice = a.join(",");
			});

			angular.extend($scope.jobs, jobs);
		});

		$scope.run = function(job) {
			visuals.pushSpinner();
			api.call({
				method: 'run',
				jobID: job.jobID
			}).then(function(res) {
				visuals.popSpinner();
				console.log(res);
				//visuals.pushModal('result of:' + job.name, res.result);

				visuals.pushModal('result of:' + job.name, "<pre>{{result}}</pre>", "", function () {
				}, "lg", {
					result:res.result
				});
			}).catch( function (err) {
				visuals.popSpinner();
				visuals.pushModal('faild to run:' + job.name, err);
			});
		};

		$scope.save = function(job, frm) {
			var m = job.$new ? 'addjob' : 'updatejob';
			api.call({
				method: m,
				data: job
			}).then(function(res) {

				if (job.$new) {
					angular.extend(job, res);
					job.$new = false;
				}

				frm.$setPristine();
				console.log(m, "job");
			});
		};

		$scope.remove = function(job) {
			if(job.$new) {
				var idx = $scope.jobs.indexOf(job);
				if (idx !== -1) {
					$scope.jobs.splice(idx, 1);
				}
				return;
			}

			api.call({
				method: 'deletejob',
				data: job
			}).then(function() {
				var idx = $scope.jobs.indexOf(job);
				if (idx !== -1) {
					$scope.jobs.splice(idx, 1);
				}
			});
		};
	});

	return {
		templateUrl: 'routes/' + name + '/' + name + '.html',
		controller: name
	};

});
