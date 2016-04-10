# [go-debug](https://atom.io/packages/go-debug)

A go debugger for atom using [delve](https://github.com/derekparker/delve).

![Demo](https://raw.githubusercontent.com/lloiser/go-debug/master/resources/demo.gif)

## Install

Either `apm install go-debug` or search for `go-debug` in the settings.

### Install delve

see https://github.com/derekparker/delve/tree/master/Documentation/installation

## Key bindings

* `f5` runs the current package (`dlv debug`)
* `ctrl-f5` runs the current package tests (`dlv test`)
* `shift-f5` restarts the current delve session (`r / restart`)
* `f6` stops delve (`exit / quit / q`)
* `f8` continue the execution (`c / continue`)
* `f9` toggle breakpoint
* `f10` step over to next source line (`n / next`)
* `f11` step into functions (`s / step`)
* `cmd-k cmd-g` (mac) / `ctrl-k ctrl-g` (others) toggles the main panel

## Links

* Gopher community on slack: [![Slack](https://img.shields.io/badge/gophers_slack-%23go--plus-blue.svg?style=flat)](https://gophersinvite.herokuapp.com) <br />Questions? Use the `go-plus` channel or send me direct messages
