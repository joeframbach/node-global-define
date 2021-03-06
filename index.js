/**
 * Creates global define function to mimic requirejs define in node
 */

var originalRequireJS
  , basePath // root directory of the project
  , basePathRegexp // used for search-n-replace with black/white lists handling
  , exposeAmdefine = false // flag for exposing `.amd` and `.require` properities of `amdefine`
  , paths          = {} // paths aliases
  , blackList      = [] // excludes patterns from global define
  , whiteList      = [] // limits global define to patterns
  , fs             = require('fs')
  , path           = require('path')
  , amdefine       = require('amdefine')
  , minimatch      = require('minimatch')
  ;

// augment default js extension
if (require.extensions['.js']._id != module.id)
{
  // hijack .js handler to add module specific define function to global namespace
  originalRequireJS = require.extensions['.js'];
  require.extensions['.js'] = function customRequireHandler(requiredModule, filename)
  {
    var compiledModule
      , originalDefine = global.define // preserve original global define
      ;

    // create global define specific to the module
    // but only if its whitelisted and not blacklisted
    if (isWhitelisted(requiredModule.id) && !isBlacklisted(requiredModule.id))
    {
      global.define = amdefineWorkaround(requiredModule);
    }
    else
    {
      // reset global define
      delete global.define;
    }

    // compile module as per normal workflow
    compiledModule = originalRequireJS(requiredModule, filename);

    // revert back global define
    global.define = originalDefine;

    return compiledModule;
  }

  // mark the thing
  require.extensions['.js']._id = module.id;
}

// export API function to update basePath
module.exports = function(options)
{
  basePath  = options.basePath || process.cwd();
  paths     = options.paths || paths;
  blackList = options.blackList || blackList;
  whiteList = options.whiteList || whiteList;

  // if flag provided override default value
  if ('exposeAmdefine' in options)
  {
    exposeAmdefine = options.exposeAmdefine;
  }

  // construct basePath regexp
  basePathRegexp = new RegExp(('^' + basePath + '/').replace('/', '\\/'));

  // return define tailored to the requiring module
  return amdefineWorkaround(module.parent || process.mainModule);
}

// create workaround for amdefine
// to treat all the module equally
// (by default it doesn't execute modules with ids)
function amdefineWorkaround(requiredModule)
{
  // prepare define function
  var define = amdefine(requiredModule, pretendRequire(requiredModule));

  // return wrapper
  function wrapper(id, deps, initializer)
  {
    // init module
    define(id, deps, initializer);

    // if module provides id
    // force it to be executed anyway
    if (typeof id == 'string')
    {
      requiredModule.exports = define.require(id);
    }
  }

  // make it look like legit thing
  if (exposeAmdefine)
  {
    wrapper.amd     = define.amd;
    wrapper.require = define.require;
  }

  return wrapper;
}

// check for requested path, if it has "/"" in the path
// and doesn't start with "." or "/"
// treat it as path relative to the project's root
// and replace it with absolute path
function pretendRequire(baseModule)
{
  return function pretendRequire_require(moduleId)
  {

    var componentPath
        // translate module to path alias
      , modulePath = checkPath(moduleId)
        // get first part of the module path
      , component = (modulePath || '').split('/')[0]
      ;

    // check if name and path belong to the app or to node_modules
    if (component && component[0] != '.')
    {
      componentPath = path.resolve(basePath, component);

      if (fs.existsSync(componentPath))
      {
        // everything fits nicely, get the full thing
        // file might not exist at this point
        // but its legit developer's error
        modulePath = path.resolve(basePath, modulePath);
      }
    }

    return baseModule.require(modulePath);
  }
}

// check path aliases
function checkPath(id)
{
  var p;

  for (p in paths)
  {
    if (id.indexOf(p) == 0)
    {
      return id.replace(p, paths[p]);
    }
  }

  return id;
}

// checks blackList, using glob-like patterns
function isBlacklisted(moduleId)
{
  var i;

  // strip basePath
  moduleId = moduleId.replace(basePathRegexp, '');

  for (i=0; i<blackList.length; i++)
  {
    if (minimatch(moduleId, blackList[i]))
    {
      return true;
    }
  }

  return false;
}

// checks whiteList, using glob-like patterns
// if white list is empty treat it as everything in white list
function isWhitelisted(moduleId)
{
  var i;

  // check if its empty
  if (!whiteList.length)
  {
    return true;
  }

  // strip basePath
  moduleId = moduleId.replace(basePathRegexp, '');

  for (i=0; i<whiteList.length; i++)
  {
    if (minimatch(moduleId, whiteList[i]))
    {
      return true;
    }
  }

  return false;
}
