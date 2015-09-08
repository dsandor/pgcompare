var app = require('app'),  // Module to control application life.
    BrowserWindow = require('browser-window'),  // Module to create native browser window.
    ipc = require('ipc'),
    pg = require('pg'),
    _ = require('lodash'),
    fs = require('fs'),
    async = require('async');

// Report crashes to our server.
require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform != 'darwin') {
        app.quit();
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 800, height: 620});

    // and load the index.html of the app.
    mainWindow.loadUrl('file://' + __dirname + '/html/index.html');

    // Open the devtools.
    //mainWindow.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
});

ipc.on('main-log', function(event, arg) {
    console.log('main-log', 'arg:', arg);
    event.returnValue = 'Thanks from main-log.';
});

ipc.on('start-compare', function(event, source, dest) {
    startCompare(source, dest);
});

// TODO: need to make the renderer side send the filename and then here
// load it which gets the source and dest configs.  these are then loaded and sent to
// settings screen.
ipc.on('navigate-load-settings', function(event, filename) {

    console.log('nls: ' + filename[0]);

    // somehow push the settings to the settings screen.
    mainWindow.setTitle('Settings');
    mainWindow.loadUrl('file://' + __dirname + '/html/settings.html');

    fs.readFile(filename[0], function(err, data) {
        console.log('loaded file: ' + filename[0]);
        console.log('loaded data: ' + data);

    setTimeout(function() {
            console.log('about to call load-settings...');
            mainWindow.webContents.send('load-settings', JSON.parse(data));
        }, 650);
    });
});

ipc.on('navigate-settings', function() {
    mainWindow.setTitle('Settings');
    mainWindow.loadUrl('file://' + __dirname + '/html/settings.html');

});

ipc.on('save-settings', function(event, filename, settings) {

    if (filename.indexOf('.pgc') < 1) filename += '.pgc';

    fs.writeFile(filename, JSON.stringify(settings), function(err) {
        mainWindow.webContents.send('settings-saved', filename);
    });
});

function startCompare(source, dest) {
    console.log('source', source, 'dest', dest);

    mainWindow.setTitle('Comparing ' + source.name + ' to ' + dest.name + '...');
    mainWindow.loadUrl('file://' + __dirname + '/html/compare.html');

    var results = {
        sourceSchema: {},
        destinationSchema: {}
    };

    resolveObjects(source, dest, function(r) {
        results = r;

        compareRoutines(results, function(routineCompareResults) {
            console.log('called: schema-data-loaded');
            mainWindow.webContents.send('schema-data-loaded', routineCompareResults);
        });
    })
}

function resolveObjects(source, dest, callback) {
    var results = {
        sourceSchema: {},
        destinationSchema: {}
    };

    var completedCount = 0, totalCount = 3;

    getSchemaData(source, function(err, source_result) {
        console.log('got source schema data');

        results.sourceSchema = source_result;

        getSchemaData(dest, function(err, dest_result) {
            console.log('got dest schema data');
            results.destinationSchema = dest_result;

            compareSchemas(results, function(compareResults) {
                results.compareResults = compareResults;

                console.log('compareResults:', JSON.stringify(compareResults));

                completedCount++;

                if (completedCount == totalCount) {
                    callback(results);
                }
            });
        });
    });

    getRoutineData(source, function(err, result) {
        results.sourceRoutines = result;

        completedCount++;

        if (completedCount == totalCount) {
            callback(results);
        }
    });

    getRoutineData(dest, function(err, result) {
        results.destinationRoutines = result;
        completedCount++;

        if (completedCount == totalCount) {
            callback(results);
        }
    });
}

function compareRoutines(schemaData, cb) {

    for(var i= 0, max= schemaData.sourceRoutines.length; i < max; i++) {
        //console.log('routine: ' + schemaData.sourceRoutines[i].routine_name + '\r\nddl: ' + schemaData.sourceRoutines[i].ddl);
        var destRoutine = _.findWhere(schemaData.destinationRoutines, { full_name: schemaData.sourceRoutines[i].full_name });

        if (typeof destRoutine == 'undefined') {
            schemaData.compareResults.push(
                {
                    object_type: 'routine',
                    source_object_name: schemaData.sourceRoutines[i].full_name,
                    destination_object_name: '',
                    status: '!>',
                    isSelected: false
                }
            );
        } else {
            if (schemaData.sourceRoutines[i].ddl == destRoutine.ddl) {
                schemaData.compareResults.push(
                    {
                        object_type: 'routine',
                        source_object_name: schemaData.sourceRoutines[i].full_name,
                        destination_object_name: destRoutine.full_name,
                        status: '=',
                        isSelected: false
                    }
                );
            } else {
                schemaData.compareResults.push(
                    {
                        object_type: 'routine',
                        source_object_name: schemaData.sourceRoutines[i].full_name,
                        destination_object_name: destRoutine.full_name,
                        status: '!=',
                        isSelected: false
                    }
                );
            }
        }
    }

    cb(schemaData);
}

function compareSchemas(schemaData, cb) {

    console.log('source table count: ' + schemaData.sourceSchema.length +
    ' dest table count: ' + schemaData.destinationSchema.length);

    var compareResults = _.map(schemaData.sourceSchema, function(sourceItem) {

        mainWindow.webContents.send('comparing-message', 'comparing table: ' + sourceItem.table_name);

        console.log('sourceItem.columns: ' + sourceItem.columns.length);

        var destMatch = _.findWhere(schemaData.destinationSchema, { 'table_name': sourceItem.table_name  });

        if (typeof destMatch == 'undefined') {
            return {
                object_type: 'table',
                source_object_name: sourceItem.table_name,
                destination_object_name: '',
                status: '!>',
                isSelected: false
            };
        }

        return {
            object_type: 'table',
            source_object_name: sourceItem.table_name,
            destination_object_name: destMatch.table_name,
            status: '=',
            isSelected: false
        };
    });

    for(var i= 0, max=schemaData.destinationSchema.length; i < max; i++) {
        var sourceMatch = _.findWhere(schemaData.sourceSchema, { 'table_name': schemaData.destinationSchema[i].table_name  });

        if (typeof sourceMatch == 'undefined') {
            compareResults.push({
                object_type: 'table',
                source_object_name: '',
                destination_object_name: schemaData.destinationSchema[i].table_name,
                status: '!<',
                isSelected: false
            });
        }
    }


    cb(compareResults);
}

// http://www.postgresql.org/docs/current/interactive/infoschema-routines.html
function getSchemaData(serverData, cb) {
    var conString = "postgres://" + serverData.server + "/" + serverData.database;

    console.log('connection string:', conString);

    pg.defaults.port = serverData.port;
    pg.defaults.ssl = true;
    pg.defaults.user = serverData.username;
    pg.defaults.password = serverData.password;
    pg.defaults.host = serverData.server;
    pg.defaults.database = serverData.database;

    mainWindow.webContents.send('comparing-message', 'loading schema: ' + serverData.name);

    pg.connect(conString, function(err, client, done) {
        if(err) {
            cb(err);

            return console.error('error fetching client from pool', err);
        }

        client.query(sql_table_list, [serverData.schema], function(err, result) {
            //call `done()` to release the client back to the pool
            done();

            if(err) {
                cb(err);

                return console.error('error running query', err);
            }

            // Gets all the columns for the table.
            async.eachSeries(result.rows, function(item, async_done) {
                    client.query(sql_table_details, [serverData.schema, item.table_name], function(col_err, col_result) {
                        done();

                        if(col_err) {
                            async_done(col_err);

                            return console.error('error running query', col_err);
                        }
                        item.columns = col_result.rows;

                        async_done();
                    });
            },
            function() {
                cb(undefined, result.rows);
            });

        });
    });
}

function getRoutineData(serverData, cb) {
    var conString = "postgres://" + serverData.server + "/" + serverData.database;

    console.log('connection string:', conString);

    pg.defaults.port = serverData.port;
    pg.defaults.ssl = true;
    pg.defaults.user = serverData.username;
    pg.defaults.password = serverData.password;
    pg.defaults.host = serverData.server;
    pg.defaults.database = serverData.database;

    mainWindow.webContents.send('comparing-message', 'loading routines: ' + serverData.name);

    pg.connect(conString, function(err, client, done) {
        if(err) {
            cb(err);

            return console.error('error fetching client from pool', err);
        }

        client.query(sql_routine_list, [serverData.schema], function(err, result) {
            done();

            if(err) {
                cb(err);

                return console.error('error running query', err);
            }


            // Gets all the DDL for the routines.
            async.eachSeries(result.rows, function(item, async_done) {
                    mainWindow.webContents.send('comparing-message', 'getting ddl for: ' + item.routine_name);

                    var specificNameElements = item.specific_name.split('_');
                    var routineId = specificNameElements[specificNameElements.length-1];

                        client.query(sql_routine_ddl, [routineId], function(col_err, col_result) {
                        done();

                        if(col_err) {
                            async_done(col_err);

                            return console.error('error running query', col_err);
                        }
                        item.ddl = col_result.rows[0].pg_get_functiondef;
                        var offset_dot = item.ddl.indexOf('.'),
                            offset_op  = item.ddl.indexOf('('),
                            offset_ep  = item.ddl.indexOf(')');

                        // extract function name
                        if (offset_dot > 0 && offset_op > offset_dot && offset_ep > offset_op) {
                            var full_name = item.ddl.substr(offset_dot + 1, (offset_ep - offset_dot) + 1);
                            item.full_name = full_name;
                        }

                        console.log('item.full_name: ' + item.full_name);
                        async_done();
                    });
                },
                function() {
                    cb(undefined, result.rows);
                });

        });
    });
}
/*
pg.connect(conString, function(err, client, done) {
    if(err) {
        return console.error('error fetching client from pool', err);
    }
    client.query('SELECT $1::int AS number', ['1'], function(err, result) {
        //call `done()` to release the client back to the pool
        done();

        if(err) {
            return console.error('error running query', err);
        }
        console.log(result.rows[0].number);
        //output: 1
    });
});
*/

// $1 = schema name
// $2 = table name
var sql_table_details = "select c.table_catalog, c.table_schema, c.table_name, c.column_name, " +
"c.column_default, c.is_nullable, c.data_type, c.character_maximum_length, " +
"    c.numeric_precision, c.numeric_precision_radix, c.numeric_scale, c.datetime_precision, " +
"    c.udt_name " +
"from " +
"information_schema.columns c " +
"where table_schema = $1 AND table_name = $2 " +
"order by ordinal_position ASC;";

// $1 = schema name
var sql_table_list = "select * from information_schema.tables where table_schema = $1;";

// $1 = schema name
var sql_routine_list = "select * FROM information_schema.routines where routine_schema = $1;";

// $1 = routine id
var sql_routine_ddl = "select * from pg_get_functiondef($1);";