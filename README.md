# [go-debug](https://atom.io/packages/go-debug)

A go debugger for atom using [delve](https://github.com/derekparker/delve).

![Demo](https://raw.githubusercontent.com/lloiser/go-debug/master/resources/demo.gif)

## Install

Either `apm install go-debug` or search for `go-debug` in the settings.

### Install delve

`go-debug` tries to install/download delve automatically.

If this fails you can still do it manually by using this guide: https://github.com/derekparker/delve/tree/master/Documentation/installation

## Configuration

`go-debug` has two built-in configurations. Both work on the file/package that is currently open in atom.

* `Debug`: compile and debug the current package
* `Test`: compile and debug the tests of the current package

It's possible to create additional configurations by creating a file and setting the path in the `go-debug` setting `Configuration File`. You can even specify multiple configurations by separating the paths in this setting with commas. Relative paths will be resolved relative to the current project.

Such a configuration file looks like:

```js
{
  "configurations": [
    { /* a configuration */ },
    { /* another configuration */ },
    // ...
  ]
}
```

Each configuration supports the following options:

```js
{
  // "name" is the display name in the panel (REQUIRED)
  "name": "...",

  // "mode" determines how to start / connect to delve (REQUIRED)
  // * debug is used to debug a package
  // * test debugs the tests of the package
  // * remote connects to an already running headless delve session on a remote server (see "host" and "port" below)
  // * exec debugs a precompiled executable (see "program" below)
  "mode": "debug" | "test" | "remote" | "exec",

  // used to pass arguments to the executed package / tests (e.g. "-v").
  "args": ["..."],

  // use this if you have to specify additional environment variables.
  "env": { "<key>": "<value>" },

  // "cwd" specifies the current working directory where delve starts from.
  // This is useful if you always want to debug/test a specific package (e.g. the "main" package) but are currently working on another package
  "cwd": "<dir>",

  // "host" and "port" are used to modify the default port of the locally running delve server.
  // If "mode" is "remote" then these define the host and port of the server where a "headless" delve is running.
  "host": "localhost",
  "port": 2345,

  // "program" contains the path to a precompiled executable that should be debugged.
  // (useful if you have a custom build chain like gb)
  "program": "<path>",

  // pass additional build flags when delve compiles the package/tests.
  "buildFlags": "",

  // a path to the "init" file that will be executed once delve has started.
  "init": "<path>",

  // turns on/off (default) the "verbose" logging for delve (useful if you encounter problems with delve or go-debug).
  "showLog": true | false
}
```

All string options can make use of the following variables by using `${...}` somewhere inside the string:

```js
{
  // the working directory on startup of atom
  cwd: "...",
  // the open file (full path)
  file: "...",
  // the open file's basename
  fileBasename: "...",
  // the open file's dirname
  fileDirname: "...",
  // the open file's extension
  fileExtname: "...",
  // the open file relative to the "workspaceRoot" variable
  relativeFile: "...",
  // the full path of the project root folder
  workspaceRoot: "...",
  // this contains all environment variables known to atom including the "env" variables from above.
  // They can be used like so "${env.GOPATH}/src/..."
  env: { "<key>": "<value>" }
}
```

_Note: `go-debug` also supports the configuration for vscode which are stored in `.vscode/launch.json`. But be aware that not all configurations might work!_

### Examples

Always debug the `cmd` of your program wherever you are right now in your code and add some arguments and environment variables:
```js
{
  "name": "Debug cmd",
  "mode": "debug",
  "cwd": "${workspaceRoot}/cmd",
  "args": ["--connection=sql"],
  "env": {
    "USER": "ROOT",
    "PW": "SECRET!"
  }
}
```

Start tests with verbose flag:
```js
{
  "name": "Verbose Test",
  "mode": "test",
  "args": ["-test.v"]
}
```

## Key bindings

* `f5` starts the current selected configuration
* `shift-f5` restarts the current delve session (`r / restart`)
* `f6` stops delve (`exit / quit / q`)
* `f8` continue the execution (`c / continue`)
* `f9` toggle breakpoint
* `f10` step over to next source line (`n / next`)
* `f11` step into functions (`s / step`)
* `shift-f11` step out of functions (`stepOut`)
* `cmd-k cmd-g` (mac) / `ctrl-k ctrl-g` (others) toggles the main panel

## Links

* Gopher community on slack: [![Slack](https://img.shields.io/badge/gophers_slack-%23go--plus-blue.svg?style=flat)](https://gophersinvite.herokuapp.com) <br />Questions? Use the `go-plus` channel or send me direct messages
