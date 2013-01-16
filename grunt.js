var fs = require('fs');
var markdown = require('node-markdown').Markdown;

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    srcModules: [], //to be filled in by find-modules task
    tplModules: [], 
    ngversion: '1.0.3',
    pkg:'<json:package.json>',
    dist: 'dist',
    filename: 'ui-bootstrap',
    meta: {
      modules: 'angular.module("ui.bootstrap", [<%= srcModules %>]);',
      tplmodules: 'angular.module("ui.bootstrap.tpls", [<%= tplModules %>]);',
      all: 'angular.module("ui.bootstrap", ["ui.bootstrap.tpls", <%= srcModules %>]);'
    },
    lint: {
      files: ['grunt.js','src/**/*.js']
    },
    watch: {
      files: ['<config:lint.files>', 'template/**/*.html'],
      tasks: 'before-test test-run'
    },
    concat: {
      dist: {
        src: ['<banner:meta.modules>'],
        dest: '<%= dist %>/<%= filename %>-<%= pkg.version %>.js'
      },
      dist_tpls: {
        src: ['<banner:meta.all>', '<banner:meta.tplmodules>'],
        dest: '<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.js'
      }
    },
    min: {
      dist:{
        src:['<%= dist %>/<%= filename %>-<%= pkg.version %>.js'],
        dest:'<%= dist %>/<%= filename %>-<%= pkg.version %>.min.js'
      },
      dist_tpls:{
        src:['<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.js'],
        dest:'<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.min.js'
      }
    },
    html2js: {
      src: ['template/**/*.html']
    },
    jshint: {
      options: {
        curly: true,
        immed: true,
        newcap: true,
        noarg: true,
        sub: true,
        boss: true,
        eqnull: true
      },
      globals: {}
    }
  });

  //register before and after test tasks so we've don't have to change cli options on the goole's CI server
  grunt.registerTask('before-test', 'lint html2js');
  grunt.registerTask('after-test', 'find-modules build min site');

  // Default task.
  grunt.registerTask('default', 'before-test test after-test');

  //Common ui.bootstrap module containing all modules for src and templates
  grunt.registerTask('find-modules', 'Generate ui.bootstrap and template modules depending on all existing directives', function() {
    grunt.file.expandDirs('src/*').forEach(function(dir) {
      findModule(dir.split('/')[1]);
    });
  });

  //Adds a given module to config
  function findModule(name) {
    function enquote(str) {
      return '"' + str + '"';
    }
    var tplBase = 'template/' + name + '/*.html',
      srcBase = 'src/' + name + '/*.js',
      tplModules = grunt.config('tplModules'),
      srcModules = grunt.config('srcModules');

    grunt.file.expand(tplBase).map(function(file) {
      tplModules.push(enquote(file));
    });
    grunt.file.expand(srcBase).forEach(function(file) {
      srcModules.push(enquote('ui.bootstrap.' + name));
    });

    grunt.config('tplModules', tplModules);
    grunt.config('srcModules', srcModules);
  }

  grunt.registerTask('dist', 'Override dist directory', function() {
    var dir = this.args[0];
    if (dir) { grunt.config('dist', dir); }
  });

  grunt.registerTask('build', 'Build custom bootstrap file', function() {
    var srcFiles, tplFiles;
    if (this.args.length) {
      this.args.forEach(findModule);
      srcFiles = this.args.map(function(name) {
        return 'src/' + name + '/*.js';
      });
      tplFiles = this.args.map(function(name) {
        return 'template/' + name + '/*.html.js';
      });
      grunt.config('filename', grunt.config('filename')+'-custom');
    } else {
      srcFiles = ['src/*/*.js'];
      tplFiles = ['template/*/*.html.js'];
    }
    grunt.config('concat.dist.src', 
                 grunt.config('concat.dist.src').concat(srcFiles));
    grunt.config('concat.dist_tpls.src',
                 grunt.config('concat.dist_tpls.src').concat(srcFiles).concat(tplFiles));
    grunt.task.run('concat');
  });

  grunt.registerTask('site', 'Create grunt demo site from every module\'s files', function() {
    this.requires('find-modules concat html2js');

    function breakup(text, separator) {
      return text.replace(/[A-Z]/g, function (match) {
        return separator + match;
      });
    }

    function ucwords(text) {
      return text.replace(/^([a-z])|\s+([a-z])/g, function ($1) {
        return $1.toUpperCase();
      });
    }

    var modules = grunt.file.expandDirs('src/*').map(function(dir) {

      var moduleName = dir.split("/")[1];
      if (fs.existsSync(dir + "docs")) {
        return {
          name: moduleName,
          displayName: ucwords(breakup(moduleName, ' ')),
          js: grunt.file.expand(dir + "docs/*.js").map(grunt.file.read).join(''),
          html: grunt.file.expand(dir + "docs/*.html").map(grunt.file.read).join(''),
          description: grunt.file.expand(dir + "docs/*.md").map(grunt.file.read).map(markdown).join('')
        };
      }
    }).filter(function(module){
       return module !== undefined;
    });

    var templateFiles = grunt.file.expand("template/**/*.html.js");
    
    grunt.file.write(
      'dist/index.html',
      grunt.template.process(grunt.file.read('misc/demo-template.html'), {
        modules: modules,
        templateModules: templateFiles.map(function(fileName) {
          return "'"+fileName.substr(0, fileName.length - 3)+"'";
        }),
        templates: templateFiles.map(grunt.file.read).join(''),
        version : grunt.config('pkg.version'),
        ngversion: grunt.config('ngversion')
      })
    );
    
    grunt.file.expand('misc/demo-assets/*').forEach(function(path) {
      grunt.file.copy(path, 'dist/assets/' + path.replace('misc/demo-assets/',''));
    });
  });

  //Html templates to $templateCache for tests
  //@return filename of js file
  function html2js(file) {
    return htmljsName;
  }
  grunt.registerMultiTask('html2js', 'Generate js versions of html template', function() {
    var files = grunt._watch_changed_files || grunt.file.expand(this.data);
    files.forEach(function(file) {
      var TPL='angular.module("<%= file %>", []).run(["$templateCache", function($templateCache){\n' +
        '  $templateCache.put("<%= file %>",\n    "<%= content %>");\n' +
        '}]);\n';
      grunt.file.write(file + ".js", grunt.template.process(TPL, {
        file: file,
        content: escapeContent(grunt.file.read(file))
      }));
    });
    function escapeContent(content) {
      return content.replace(/"/g, '\\"').replace(/\n/g, '" +\n    "').replace(/\r/g, '');
    }
  });

  // Testacular configuration
  function runTestacular(command, options) {
    var testacularCmd = process.platform === 'win32' ? 'testacular.cmd' : 'testacular';
    var args = [command].concat(options);
    var done = grunt.task.current.async();
    var child = grunt.utils.spawn({
        cmd: testacularCmd,
        args: args
    }, function(err, result, code) {
      if (code) {
        done(false);
      } else {
        done();
      }
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }

  grunt.registerTask('test', 'run tests on single-run server', function() {
    var options = ['--single-run', '--no-auto-watch', '--log-level=warn'];
    if (process.env.TRAVIS) {
      options =  options.concat(['--browsers=Firefox']);
    } else {
      //Can augment options with command line arguments
      options =  options.concat(this.args);
    }
    runTestacular('start', options);
  });

  grunt.registerTask('server', 'start testacular server', function() {
    var options = ['--no-single-run', '--no-auto-watch'].concat(this.args);
    runTestacular('start', options);
  });

  grunt.registerTask('test-run', 'run tests against continuous testacular server', function() {
    var options = ['--single-run', '--no-auto-watch'].concat(this.args);
    runTestacular('run', options);
  });

  grunt.registerTask('test-watch', 'start testacular server, watch & execute tests', function() {
    var options = ['--no-single-run', '--auto-watch'].concat(this.args);
    runTestacular('start', options);
  });
  
  return grunt;
};
