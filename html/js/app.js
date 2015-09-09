var ipc = require('ipc');
var remote = require('remote');
var dialog = remote.require('dialog');

angular.module('pgCompareApp', ['720kb.tooltips'])
    .controller('mainController', function() {
        var todoList = this;
        todoList.todos = [
            {text:'learn angular', done:true},
            {text:'build an angular app', done:false}];

        todoList.addTodo = function() {
            todoList.todos.push({text:todoList.todoText, done:false});
            todoList.todoText = '';
        };

        todoList.remaining = function() {
            var count = 0;
            angular.forEach(todoList.todos, function(todo) {
                count += todo.done ? 0 : 1;
            });
            return count;
        };

        todoList.archive = function() {
            var oldTodos = todoList.todos;
            todoList.todos = [];
            angular.forEach(oldTodos, function(todo) {
                if (!todo.done) todoList.todos.push(todo);
            });
        };
    })

    .controller('settingsController',['$scope','$http', function($scope, $http) {
        $scope.sourceSettings = {};
        $scope.destinationSettings = {};
        $scope.isSaving = false;

        $scope.startCompare = function() {
            ipc.send('start-compare', $scope.sourceSettings, $scope.destinationSettings);
        };

        $scope.saveSettings = function() {
            dialog.showSaveDialog(function (filename) {
                if (filename === undefined) return;

                var settings = { sourceSettings: $scope.sourceSettings, destinationSettings: $scope.destinationSettings };

                $scope.isSaving = true;
                ipc.send('save-settings', filename, settings);
            });
        };

        ipc.on('saved-settings', function(message) {
            $scope.$apply(function() {
                $scope.isSaving = false;
            });
        });

        ipc.on('load-settings', function(settings) {
            $scope.$apply(function() {
                $scope.sourceSettings = settings.sourceSettings;
                $scope.destinationSettings = settings.destinationSettings;
            });
        });

    }])

    .controller('changesController',['$scope', function($scope) {

        $scope.sourceTables = [ ];
        $scope.isLoading = true;
        $scope.compareResults = [ ];
        $scope.hideMatches = true;

        // TODO: make this controller get the settings from the main process.

        $scope.loadingMessage = "Loading tables...";

        $scope.criteriaMatch = function( criteria ) {
            return function( item ) {
                if (!$scope.hideMatches) return true;

                return item.status != '=';
            };
        };

        $scope.hideMatchesClick = function() {
            $scope.hideMatches = !$scope.hideMatches;
            console.log('hideMatches? ' + $scope.hideMatches);
        };

        $scope.applyChanges = function() {
            console.log('applyChanges called, ' + $scope.compareResults.length);
            for(var i= 0,max=$scope.compareResults.length; i<max; i++)
            {
                if ($scope.compareResults[i].isSelected) {
                    console.log('selected change: ' + JSON.stringify($scope.compareResults[i]));
                }
            }
        };

        startCompare = function() {
            ipc.send('apply-changes', $scope.sourceSettings, $scope.destinationSettings);
        };

        $scope.backToSettings = function() {
            var settings = { sourceSettings: $scope.sourceSettings, destinationSettings: $scope.destinationSettings };

            ipc.send('navigate-back-settings', settings);
        };

        //comparing-message
        ipc.on('comparing-message', function(msg) {
            $scope.$apply(function() {
                $scope.loadingMessage = msg;
            });
        });

        ipc.on('schema-data-loaded', function(schemaData) {

            $scope.$apply(function() {
                $scope.isLoading = false;

                $scope.sourceTables = schemaData.sourceSchema;
                $scope.destinationTables = schemaData.destinationSchema;
                $scope.compareResults = schemaData.compareResults;
            });

        });

    }]);
